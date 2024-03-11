console.info("%c v1.1.7 %c TDV-BAR-CARD ", "color: #000000; background:#ffa600 ; font-weight: 700;", "color: #000000; background: #03a9f4; font-weight: 700;");

class TDVBarCard extends HTMLElement
 {
//#################################################################################################  
  // The user supplied configuration. Throw an exception and Home Assistant will render an error card.
  setConfig(config)
   {
    if(!config.entities) 
     {
      throw new Error("You need to define an entities");
     }
    this.config=config;
   }
//#################################################################################################
  // The height of your card. Home Assistant uses this to automatically distribute all cards over the available columns.
  getCardSize()
   {
    if(this.barData) return math.trunc((this.barData.length*this.metric.bar_h)/50);
    else return 1; 
   }
//#################################################################################################
  // Whenever the state changes, a new `hass` object is set. Use this to update your content.
  set hass(hass)
   {
    this._hass=hass;
    // Initialize the content if it's not there yet.
    if(!this.canvas)
     {
      this._anTimerId=null;  //Animation timer id 
      this._anStart=performance.now();

      this._tracker={};
      this._broadcast=new BroadcastChannel("tdv-bar");
      this._msecperday=86400000;// msec per day
      this._scale=this._msecperday/146;

      //-------------------------------------------------------------------------------------------
      // Define color constant
      this._compStyle=getComputedStyle(document.getElementsByTagName('body')[0]);
      this.fonts={}
      this.fonts.name=this._compStyle.getPropertyValue("--paper-font-body1_-_font-size")+" "+this._compStyle.getPropertyValue("--paper-font-body1_-_font-family"); 

      this._rebuildColorValue();

      this.barData=[];
   
      // Check config for generate preview card
      if(this.config.entities&&Array.isArray(this.config.entities)&&this.config.entities.length==1&&this.config.entities[0].entity&&this.config.entities[0].entity=="<enter base entity name>")
       {
        // Create full the object copy for prevent use preview configuration
        this.config=JSON.parse(JSON.stringify(this.config));

        this.config.title=null;
        this.config.entities=[];
        for(let i in this._hass.states)
         {
          if(i.startsWith("sensor.")&&i.endsWith("_power"))
           {
            //console.log(i);
            //console.dir(this._hass.states[i]);
            if(this.config.entities.push({entity:i,icon:"mdi:power",name:this._hass.states[i].attributes.friendly_name})>3) break;
           }
         }

       }


      // Range
      this.minpos=this.config.rangemin>0?this.config.rangemin:0;
      this.maxpos=this.config.rangemax>0?this.config.rangemax:2000; 
      // Convert range value to log10 scale
      this.maxposraw=this.maxpos;

      this.scaletype=this.config.scaletype?this.config.scaletype.toLowerCase():"log10";
      switch(this.scaletype)
       {
        case "linear": break;
        case "log10": 
          this.maxpos=Math.log10(this.maxpos);
          break;
       } 

      if(this.config.entities)
       {
        // Prepare entity array

        let a=Array.isArray(this.config.entities)?this.config.entities:[this.config.entities];
        for(let i in a) 
         {
          let bdata={ ap:null,
                      fl:false,
                      ut:a[i].name??"",
                      t:"",
                      m:"",
                      e:a[i].entity,
                      i:a[i].icon,
                      d:0,h:null,
                      st:a[i].state??null,
                      bar_fg:a[i].barcolor??this.colors.bar_fg,
                      minpos:a[i].rangemin>0?a[i].rangemin:this.minpos,
                      maxpos:a[i].rangemax>0?a[i].rangemax:this.maxposraw,
                      scaletype:a[i].scaletype?a[i].scaletype.toLowerCase():this.scaletype,
                      getPos:(v,w)=>{return this._getPos(v,w,bdata);}};
             
          if(!bdata.ut&&this._hass.entities[a[i]?.entity]?.device_id)
           {
            bdata.ut=this._hass.devices[this._hass.entities[a[i].entity].device_id].name;
           }

          if(!bdata.i)
           {
            bdata.i=this._hass.entities[a[i].entity]?.icon;
            if(!bdata.i) bdata.i=this._hass.states[a[i].entity]?.attributes?.icon;
            if(!bdata.i) bdata.i=this.config.defaulticon??"mdi:power";
           }

          // calc log of maxpos if using log10
          bdata.maxposraw=bdata.maxpos;
          if (bdata.scaletype=="log10")
           {
            bdata.maxpos=Math.log10(bdata.maxpos);
           }
          // Creating an array of colors for animation
          let hsl=this._rgbToHsl(bdata.bar_fg);
          let level=hsl[2]/100*50;
          let newlightness=hsl[2]+level;
          if(/*newlightness>1*/hsl[2]>=0.5) newlightness=hsl[2]-level;

          bdata.bar_fg_a=this._hslToRgb(hsl[0],hsl[1],newlightness/*Math.max(Math.min(this._hass.themes.darkMode?hsl[2]+.15:hsl[2]-.15,1),0)*/);
          this.barData.push(bdata);  
         }
        //ap-animation pos. fl-Load flag  ut-user name e-entity i-icon d-cur.data h-hist.data st-entity on/off bar_fg-bar color  bar_fg_a-bar animation color 

       }
      //-------------------------------------------------------------------------------------------
      // Define metrics
      this.metric={hist_offset:null,data:null,bar_id:null}
      this.metric.padding=10;
      this.metric.iconsize=parseInt(this._compStyle.getPropertyValue("--paper-font-headline_-_font-size"));//24;//  style.getPropertyValue("--mdc-icon-size");
      this.metric.iconwidth=this.metric.iconsize;
      this.metric.chartwidth=146;
      this.metric.nameheight=parseFloat(this._compStyle.getPropertyValue("--paper-font-body1_-_font-size"))+7;

      this.size_w = Math.max(this.config.width??300,this.offsetWidth);
      this.size_h = Math.max(this.config.height??(this.barData.length>0?this.barData.length*(this.metric.iconsize*2):200),this.offsetHeight)+this.metric.padding;

      // Calc bar height
      if(this.barData.length) this.metric.bar_h=(this.size_h-this.metric.padding)/this.barData.length;
      //-------------------------------------------------------------------------------------------
      this.cfghistmode=this.config.histmode??1;             //0-hide 1-normal
      this.histmode=this.cfghistmode;                       //!!! This variable can be overwritten if the width of the widget is insufficient
      this.trackingmode=Number(this.config.trackingmode??1);//0-disable 1-bar only 2-history 3-bar and history 4-all bars and history  
      this.trackingvalue=this.config.trackingvalue??"max";  //min, avg, max
      this.animation=Number(this.config.animation??1);      //0-disable 1-enable

      //-------------------------------------------------------------------------------------------
      // Create card content
      let cnthtml=`<ha-card header="${this.config.title??''}" style="line-height:0;"><div style="position:relative;">`
      cnthtml+=   ` <canvas class="card-content" width="${this.size_w}px" height="${this.size_h}px" tabindex="1" style="border-radius: var(--ha-card-border-radius,12px); padding:0"></canvas>`

      // Add icon element
      for(let i in this.barData)
       {
        if(this.barData[i].i)
         {
          let edata="";
          if(this.barData[i].st) edata='data-entity="'+this.barData[i].st+'"';
          //cnthtml+=`<ha-icon id="tdvbar_${i}" icon="${this.barData[i].i}" ${edata} style="${edata?"cursor:pointer;":""} position: absolute; left:${this.metric.padding}px; top:${this.metric.bar_h*i+this.metric.padding+9/*+((this.metric.bar_h-this.metric.iconsize)/2)*/}px;"></ha-icon>`;
          cnthtml+=`<ha-icon id="tdvbar_${i}" icon="${this.barData[i].i}" ${edata} style="${edata?"cursor:pointer;":""} position: absolute; left:${this.metric.padding}px; top:${this.metric.bar_h*i+this.metric.padding+(((this.metric.bar_h-this.metric.padding)-this.metric.iconsize)/2)}px;"></ha-icon>`;//+(((this.metric.bar_h-this.metric.padding)-this.metric.iconsize)/2)
         }  
       } 

      cnthtml+=   `</div></ha-card>`;
      this.innerHTML=cnthtml;

      this.canvas=this.querySelector("canvas");
      this.ctx=this.canvas.getContext("2d");
      // Calc font metric
      //this.ctx.save();
      //this.ctx.font=this.fonts.name;
      //let m=this.ctx.measureText("AQq");
      //this.metric.nameheight=m.fontBoundingBoxAscent+m.fontBoundingBoxDescent+5;
      //this.ctx.restore();
      //-------------------------------
      // set click event handler 
      this.querySelectorAll("ha-icon").forEach(elAnchor=>
       {
        elAnchor.addEventListener("click",(ev)=>
         {
          let e=ev.target.getAttribute("data-entity"); 
          if(e)
           {
            ev.stopPropagation();
            //hass.callService("switch", "toggle", {entity_id:e});
            this._fire("hass-more-info", { entityId: e });
           }
         });
       });

      this.canvas.addEventListener("click",(ev)=>
       {
        ev.stopPropagation();
        let x,y;
        if(ev.offsetX||ev.offsetY){x=ev.offsetX;y=ev.offsetY;} else {x=ev.layerX;y=ev.layerY;} 
        if(this.metric.bar_h&&this.barData&&this.barData.length) 
         {
          let itemnum=Math.trunc(y/this.metric.bar_h);
          if(itemnum>=0&&itemnum<this.barData.length)
           {
            this._fire("hass-more-info", { entityId:this.barData[itemnum].e});
           }
         }
       });
      //-------------------------------
      this.canvas.addEventListener("mouseleave",(ev)=>
       {
        this._tracker.bar_id=null;
        this._tracker.hist_offset=null;
        this._tracker.data=null;
        this._drawBarContent();
        this._broadcast.postMessage({hist_offset:null,data:null,bar_id:null});
       });
      //-------------------------------
      this.canvas.addEventListener("mousemove",(ev)=>
       {
        let bar_id=null;
        let hist_offset=null;
        let data=null;
        let mx,my;
        if(ev.offsetX||ev.offsetY){mx=ev.offsetX;my=ev.offsetY;} else {mx=ev.layerX;my=ev.layerY;} 
        if(my>=this.metric.padding)
         {
          let i=Math.trunc((my-this.metric.padding)/this.metric.bar_h);
          let b_y0=this.metric.padding+this.metric.bar_h*i;
          let b_y1=b_y0+this.metric.bar_h-this.metric.padding;
          if(my>=b_y0&&my<b_y1&&mx>=this.metric.padding&&mx<=(this.size_w-this.metric.padding))
           {
            bar_id=i;
            let lx=mx-this.metric.padding;
            let ly=Math.round(my-b_y0);

            if(this.histmode>0&&lx>(this.metric.iconwidth+this.metric.padding)&&lx<(this.metric.iconwidth+this.metric.padding+this.metric.chartwidth+1))
             {
              hist_offset=lx-(this.metric.iconwidth+this.metric.padding+1);
              data=this._getBarHistData(i,hist_offset);
             }
           }
         }
        if(this.trackingmode>=2) this._broadcast.postMessage({hist_offset,data,bar_id});
        this._tracker.hist_offset=hist_offset;
        this._tracker.data=data;
        this._tracker.bar_id=bar_id;
        this._drawBarContent();
       });
      //-------------------------------
      this._broadcast.onmessage=(event)=>
       {
        //console.log(event.data);
        this._tracker.hist_offset=event.data.hist_offset
        this._drawBarContent();
       };
      //-------------------------------
      new ResizeObserver(rsentries=>
       {
        this._rebuildColorValue();
        this.size_w=this.offsetWidth;//this.parentElement.clientWidth-8;//this.clientWidth;
        this.histmode=(this.size_w<(this.metric.chartwidth+this.metric.iconwidth+this.metric.padding*2))?0:this.cfghistmode;

        //console.log('content dimension changed',this.clientWidth,this.clientHeight);
        this.canvas.width=this.size_w-2;
        //this.Context.canvas.height=this.h;
        this._drawBarContent();

       }).observe(this.getElementsByTagName('ha-card')[0]);

      // if some bar defined start history data requester timer
      if(this.barData.length)
       {
        if(this.histmode>0) setTimeout(TDVBarCard._reqHistEntityData,100,this,0);
      }

     }
    //----------------------------------
    let ischanged=false;
    // Applay data
    for(let i in this.barData)
     {
      let old_d=this.barData[i].d;
      if(hass.states[this.barData[i].e])
       {
        this.barData[i].d=+hass.states[this.barData[i].e].state;
        this.barData[i].t=this.barData[i].ut??(hass.states[this.barData[i].e].attributes.friendly_name??hass.states[this.barData[i].e].entity_id);
        this.barData[i].m=hass.states[this.barData[i].e].attributes.unit_of_measurement;
       }
      else
       {
        this.barData[i].d=0;
        this.barData[i].t="";
        this.barData[i].m="";
       }
      if(this.animation>0&&old_d!=this.barData[i].d&&this.barData[i].ap==null) {this.barData[i].ap=0;ischanged=true;}

      let icon=this.querySelector(`#tdvbar_${i}`);
      if(icon)
       {
        let ison=false;
        if(this.barData[i].st&&hass.states[this.barData[i].st]) ison=(hass.states[this.barData[i].st].state=="on");
        else ison=(this.barData[i].d>0);//if on/off entity state is not defined the use base state
        icon.style.color=ison?this.colors.iconon:this.colors.iconoff;
       }
     } 

    if(this._anTimerId==null&&ischanged)
     {
      let draw=()=>
       {
        let now=performance.now();
        if((now-this._anStart)>10)
         {
          this._anStart=now;

          let ch=false;
          for(let i in this.barData)
           {
            if(this.barData[i].ap!=null)
             {
              this.barData[i].ap+=0.01
              if(this.barData[i].ap>=1) this.barData[i].ap=null; 
              else ch=true;
             }  
           }
          if(!ch) this._anTimerId=null; else window.requestAnimationFrame(draw);
          this._drawAnimationFrame();
         }
        else window.requestAnimationFrame(draw);
       }
      this._anTimerId=window.requestAnimationFrame(draw);
     }
    this._drawBarContent();
   }
//#################################################################################################
  _getBarHistData(BarIdx,HistIdx)
   {
    let data;
    if(BarIdx>=0&&BarIdx<this.barData.length&&this.barData[BarIdx]&&this.barData[BarIdx].h)
     {
      switch(this.trackingvalue)
       {
        case "min": data=this.barData[BarIdx].h[HistIdx]?.mn;break
        case "avg": data=this.barData[BarIdx].h[HistIdx]?.v;break
        case "max": 
        default:    data=this.barData[BarIdx].h[HistIdx]?.mx;break
       } 
     }
    return data;
   }
//#################################################################################################
  _fire(type, detail, options)
   {
    options= options || {};
    detail= (detail === null || detail === undefined) ? {} : detail;
    const event = new Event(type,
     {
      bubbles: options.bubbles === undefined ? true : options.bubbles,
      cancelable: Boolean(options.cancelable),
      composed: options.composed === undefined ? true : options.composed
     });
    event.detail = detail;
    this.dispatchEvent(event);
    return event;
   }
//#################################################################################################
  _BuildDataArray(RawData,Start,Finish)
   {
    let GetPosFunc=(a,i)=>{return Math.trunc(new Date(a[i].last_changed).getTime()/this._scale);}
    let rawmax=GetPosFunc(RawData,RawData.length-1);
    let res=[];
    let last=null;
    let valmin=null;
    let valmax=null;
    let valavg=null;
    let valcount=0;
    let idx=null;
    let isActive=false; // If any history data is present (exclude 0) then entity is active
  
    for(let r=0,i=Start;i<=Finish;i++)
     {
      if(i<=rawmax)
       {
        if(GetPosFunc(RawData,r)<=i)
         {
          for(;r<RawData.length&&GetPosFunc(RawData,r)<=i;r++)
           {
            if(isNaN(RawData[r].state)) last=null; else last=+RawData[r].state;
            if(last!=null) 
             {
              if(valavg!=null) valavg+=last; else valavg=last;
              valcount++;
              if(valmin!=null) valmin=Math.min(valmin,last); else valmin=last;
              if(valmax!=null) valmax=Math.max(valmax,last); else valmax=last;
             }
           }
         }
        else
         {
          if(last!=null) {valavg=last;valcount++;}
          if(valmin!=null) valmin=Math.min(valmin,last); else valmin=last;
          if(valmax!=null) valmax=Math.max(valmax,last); else valmax=last;
         }
       }
      else
       {
        //last=null;
        if(last!=null) {valavg=last;valcount++;}
        if(valmin!=null) valmin=Math.min(valmin,last); else valmin=last;
        if(valmax!=null) valmax=Math.max(valmax,last); else valmax=last;
       } 
      isActive=isActive||valavg>0;
      res[i-Start]={/*k:i,*/v:valcount?valavg/valcount:null,mx:valmax,mn:valmin};
      valcount=0;
      valmin=null;
      valmax=null;
      valavg=null;
     }
    return {data:res,isactive:isActive};
   }
//#################################################################################################
  static async _reqHistEntityData(This,baridx)
   {
    if(baridx==0)
     {
      let curdate=new Date();//This._roundDate(new Date());
      This.CurMoment=Math.trunc(curdate.getTime()/This._scale);///1000;
      This.StartMoment=Math.trunc((curdate.getTime()-(This._msecperday))/This._scale);//This.CurMoment-(24*60*60*1000);// one day

      This.ReqStart=new Date(curdate-This._msecperday);
      This.ReqEnd=curdate;

//console.log("start:",This.ReqStart);
//console.log("end:",This.ReqEnd);

     }
    This.barData[baridx].fl=true;
    This._drawBarContent();

    //let data_raw=await This._fetchRecent(This.barData[baridx].e,null,null,false,false);
    let data_raw=await This._fetchRecent(This.barData[baridx].e,This.ReqStart,This.ReqEnd,false,false);
    if(data_raw&&data_raw.length&&data_raw[0]&&data_raw[0].length)
     {
      let da=This._BuildDataArray(data_raw[0],This.StartMoment,This.CurMoment);
      This.barData[baridx].h=da.data;
      This.barData[baridx].isempty=!da.isactive;
     }
    This.barData[baridx].fl=false;
    baridx++;
    This._drawBarContent();

    if(baridx<This.barData.length)
     {
      setTimeout(TDVBarCard._reqHistEntityData,100,This,baridx);
     }
    else
     {
      setTimeout(TDVBarCard._reqHistEntityData,60000,This,0);
     }
   }
//#################################################################################################
  async _fetchRecent(entityId, start, end, skipInitialState, withAttributes)
   {
    let url='history/period';
    if(start) url+=`/${start.toISOString()}`;
    url+=`?filter_entity_id=${entityId}`;
    if(end) url+=`&end_time=${end.toISOString()}`;
    if(skipInitialState) url+='&skip_initial_state';
    if(!withAttributes)  url+='&minimal_response';
    if(withAttributes)   url+='&significant_changes_only=0';
    //url+=`&no_attributes&minimal_response&significant_changes_only=0`;
    return this._hass.callApi('GET', url);
   }
//#################################################################################################
  _getResString(resname,failstr)
   {
    if(this._hass&&this._hass.selectedLanguage&&this._hass.resources&&this._hass.resources[this._hass.selectedLanguage]) 
     return this._hass.resources[this._hass.selectedLanguage][resname]??failstr;
    else 
     return failstr;
   }
//#################################################################################################
  _getPos(v,width,entity)
   {
    let pc=entity.maxpos/width;
    switch(entity.scaletype)
     {
      case "linear":
       {
        let a=Math.max(v-entity.minpos, 0)/pc;
        return Math.min(Math.round(a),width);
       } break;
      case "log10":
       {
        if(v>=1)
         {
          // minpos doesn't really make any sense to use on log scale, so we are going to ignore it
          let a=Math.log10(v)/pc;
          return Math.min(Math.round(a),width);
         }
        else return 0;
       } break;
     }
   }
//#################################################################################################
  _rgbval(color)
   {
    //let hex=color.replace(/^\s*#|\s*$/g,''); // strip the leading # if it's there
    //if(hex.length==3) hex=hex.replace(/(.)/g, '$1$1');  // convert 3 char codes --> 6, e.g. `E0F` --> `EE00FF`
    //return [parseInt(hex.substr(0,2),16),parseInt(hex.substr(2,2),16),parseInt(hex.substr(4,2),16)];

    //var div = document.createElement('div'), m;
    //div.style.color = input;
    //m = getComputedStyle(div).color.match(/^rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
    //if(m) return [m[1],m[2],m[3]];
    //else throw new Error("Colour "+input+" could not be parsed.");

    // return an array containing R, G and B values
    if(color === 'transparent') color = '#FFF';// IE (6 and ?)
    let r,g,b;
    let hex_color_pcre = new RegExp("^#[0-9a-f]{3}([0-9a-f]{3})?$",'gi');
    let rgb_color_pcre = new RegExp("rgb\\(\\s*((?:[0-2]?[0-9])?[0-9])\\s*,\\s*((?:[0-2]?[0-9])?[0-9])\\s*,\\s*((?:[0-2]?[0-9])?[0-9])\\s*\\)$",'gi');
    let rgb_percent_color_pcre = new RegExp("rgb\\(\\s*((?:[0-1]?[0-9])?[0-9])%\\s*,\\s*((?:[0-1]?[0-9])?[0-9])%\\s*,\\s*((?:[0-1]?[0-9])?[0-9])%\\s*\\)$",'gi');
    let rgba_color_pcre = new RegExp("rgba\\(\\s*((?:[0-2]?[0-9])?[0-9])\\s*,\\s*((?:[0-2]?[0-9])?[0-9])\\s*,\\s*((?:[0-2]?[0-9])?[0-9])\\s*,.*\\)$",'gi');
    let rgba_percent_color_pcre = new RegExp("rgba\\(\\s*((?:[0-1]?[0-9])?[0-9])%\\s*,\\s*((?:[0-1]?[0-9])?[0-9])%\\s*,\\s*((?:[0-1]?[0-9])?[0-9])%\\s*,.*\\)$",'gi');
    if(color.match(hex_color_pcre))
     {
      if(color.length==4){r=color.charAt(1)+""+color.charAt(1);g=color.charAt(2)+""+color.charAt(2);b=color.charAt(3)+""+color.charAt(3);}
      else {r=color.charAt(1)+""+color.charAt(2);g=color.charAt(3)+""+color.charAt(4);b=color.charAt(5)+""+color.charAt(6);}
      r=parseInt(r,16);g=parseInt(g,16);b=parseInt(b,16);
     }
    else if(color.match(rgb_color_pcre)||color.match(rgba_color_pcre)){r=+RegExp.$1;g=+RegExp.$2;b=+RegExp.$3;}
    else if(color.match(rgb_percent_color_pcre)||color.match(rgba_percent_color_pcre)){r=parseInt((RegExp.$1)*2.55);g=parseInt((RegExp.$2)*2.55);b=parseInt((RegExp.$3)*2.55);}
    else
     {
      const names=[['AliceBlue',240,248,255],['AntiqueWhite',250,235,215],['Aqua',0,255,255],['Aquamarine',127,255,212],['Azure',240,255,255],['Beige',245,245,220],['Bisque',255,228,196],['Black',0,0,0],['BlanchedAlmond',255,235,205],['Blue',0,0,255],['BlueViolet',138,43,226],['Brown',165,42,42],['BurlyWood',222,184,135],['CadetBlue',95,158,160],['Chartreuse',127,255,0],['Chocolate',210,105,30],['Coral',255,127,80],['CornflowerBlue',100,149,237],['Cornsilk',255,248,220],['Crimson',220,20,60],['Cyan',0,255,255],['DarkBlue',0,0,139],['DarkCyan',0,139,139],['DarkGoldenRod',184,134,11],['DarkGray',169,169,169],['DarkGrey',169,169,169],['DarkGreen',0,100,0],['DarkKhaki',189,183,107],['DarkMagenta',139,0,139],['DarkOliveGreen',85,107,47],['DarkOrange',255,140,0],['DarkOrchid',153,50,204],['DarkRed',139,0,0],['DarkSalmon',233,150,122],['DarkSeaGreen',143,188,143],['DarkSlateBlue',72,61,139],['DarkSlateGray',47,79,79],['DarkSlateGrey',47,79,79],['DarkTurquoise',0,206,209],['DarkViolet',148,0,211],['DeepPink',255,20,147],['DeepSkyBlue',0,191,255],['DimGray',105,105,105],['DimGrey',105,105,105],['DodgerBlue',30,144,255],['FireBrick',178,34,34],['FloralWhite',255,250,240],['ForestGreen',34,139,34],['Fuchsia',255,0,255],['Gainsboro',220,220,220],['GhostWhite',248,248,255],['Gold',255,215,0],['GoldenRod',218,165,32],['Gray',128,128,128],['Grey',128,128,128],['Green',0,128,0],['GreenYellow',173,255,47],['HoneyDew',240,255,240],['HotPink',255,105,180],['IndianRed',205,92,92],['Indigo',75,0,130],['Ivory',255,255,240],['Khaki',240,230,140],['Lavender',230,230,250],['LavenderBlush',255,240,245],['LawnGreen',124,252,0],['LemonChiffon',255,250,205],['LightBlue',173,216,230],['LightCoral',240,128,128],['LightCyan',224,255,255],['LightGoldenRodYellow',250,250,210],['LightGray',211,211,211],['LightGrey',211,211,211],['LightGreen',144,238,144],['LightPink',255,182,193],['LightSalmon',255,160,122],['LightSeaGreen',32,178,170],['LightSkyBlue',135,206,250],['LightSlateGray',119,136,153],['LightSlateGrey',119,136,153],['LightSteelBlue',176,196,222],['LightYellow',255,255,224],['Lime',0,255,0],['LimeGreen',50,205,50],['Linen',250,240,230],['Magenta',255,0,255],['Maroon',128,0,0],['MediumAquaMarine',102,205,170],['MediumBlue',0,0,205],['MediumOrchid',186,85,211],['MediumPurple',147,112,219],['MediumSeaGreen',60,179,113],['MediumSlateBlue',123,104,238],['MediumSpringGreen',0,250,154],['MediumTurquoise',72,209,204],['MediumVioletRed',199,21,133],['MidnightBlue',25,25,112],['MintCream',245,255,250],['MistyRose',255,228,225],['Moccasin',255,228,181],['NavajoWhite',255,222,173],['Navy',0,0,128],['OldLace',253,245,230],['Olive',128,128,0],['OliveDrab',107,142,35],['Orange',255,165,0],['OrangeRed',255,69,0],['Orchid',218,112,214],['PaleGoldenRod',238,232,170],['PaleGreen',152,251,152],['PaleTurquoise',175,238,238],['PaleVioletRed',219,112,147],['PapayaWhip',255,239,213],['PeachPuff',255,218,185],['Peru',205,133,63],['Pink',255,192,203],['Plum',221,160,221],['PowderBlue',176,224,230],['Purple',128,0,128],['RebeccaPurple',102,51,153],['Red',255,0,0],['RosyBrown',188,143,143],['RoyalBlue',65,105,225],['SaddleBrown',139,69,19],['Salmon',250,128,114],['SandyBrown',244,164,96],['SeaGreen',46,139,87],['SeaShell',255,245,238],['Sienna',160,82,45],['Silver',192,192,192],['SkyBlue',135,206,235],['SlateBlue',106,90,205],['SlateGray',112,128,144],['SlateGrey',112,128,144],['Snow',255,250,250],['SpringGreen',0,255,127],['SteelBlue',70,130,180],['Tan',210,180,140],['Teal',0,128,128],['Thistle',216,191,216],['Tomato',255,99,71],['Turquoise',64,224,208],['Violet',238,130,238],['Wheat',245,222,179],['White',255,255,255],['WhiteSmoke',245,245,245],['Yellow',255,255,0],['YellowGreen',154,205,50]];
      for (let i=0;i<names.length;i++)
       {
        if(color.toLowerCase()==names[i][0].toLowerCase())
         {
          return [names[i][1],names[i][2],names[i][3]];
         }
       }
      return [255,255,255];// Invalid color
     }
    return [r,g,b];


   }
//#################################################################################################
  _rgbToHsl(color)
   {
    let hex=this._rgbval(color);
    let r=hex[0]/255,g=hex[1]/255,b=hex[2]/255;
  
    let max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h,s,l=(max+min)/2;
  
    if(max==min) h=s=0; else
     {
      let d=max-min;
      s=l>0.5?d/(2-max-min):d/(max+min);
      switch(max)
       {
        case r: h=(g-b)/d+(g<b?6:0);break;
        case g: h=(b-r)/d+2;break;
        case b: h=(r-g)/d+4;break;
       }
      h/=6;
     }
    return [h, s, l];
   }
//#################################################################################################
  _hslToRgb(h, s, l)
   {
    let r, g, b;
    if(s==0) r=g=b=l; else
     {
      function hue2rgb(p,q,t)
       {
        if(t<0) t += 1;
        if(t>1) t -= 1;
        if(t<1/6) return p + (q - p) * 6 * t;
        if(t<1/2) return q;
        if(t<2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
       }
  
      let q=l<0.5?l*(1+s):l+s-l*s;
      let p=2*l-q;
      r=hue2rgb(p,q,h+1/3);
      g=hue2rgb(p,q,h);
      b=hue2rgb(p,q,h-1/3);
     }
    //return [r*255,g*255,b*255];
    return `#${Number(Math.round(r*255)).toString(16).padStart(2, '0')}${Number(Math.round(g*255)).toString(16).padStart(2, '0')}${Number(Math.round(b*255)).toString(16).padStart(2, '0')}`
   }
//#################################################################################################
  _drawBarItemAnimationFrame(x, y, width, height,entity,baridx)
   {
    let bar_x;
    if(this.histmode>0) bar_x=x+this.metric.chartwidth+this.metric.iconwidth+this.metric.padding*2;
    else bar_x=x+this.metric.iconwidth+this.metric.padding;
    let bar_yoffset=this.metric.nameheight;//Math.trunc(height/2);

    // Actual bar data  (draw animation only if the data is not tracked)
    if(entity.d>0&&/*this._tracker.bar_id!=baridx*/this._tracker.hist_offset==null&&entity.ap!=null)
     {
      let dp=entity.getPos(entity.d,width-bar_x-1);
      if(dp>4) 
       {

        if(entity.ap<0.99)
         { 
          const grd=this.ctx.createLinearGradient(bar_x+.5,0,width+.5,0);
          grd.addColorStop(0, entity.bar_fg);
          if(entity.ap>0.1) grd.addColorStop(entity.ap-0.1,entity.bar_fg);
          grd.addColorStop(entity.ap,entity.bar_fg_a);
          if(entity.ap<0.90) grd.addColorStop(entity.ap+.1,entity.bar_fg);
          grd.addColorStop(1,entity.bar_fg);

          this.ctx.fillStyle=grd;
          this.ctx.fillRect(bar_x+1.5,y+bar_yoffset+.5,dp-2.5,height-bar_yoffset-.5);
         }
        else
         {
          this.ctx.fillStyle=entity.bar_fg;
          this.ctx.fillRect(bar_x+1.5,y+bar_yoffset+.5,dp-2.5,height-bar_yoffset-.5);
         }

        // Bar grid
        this.ctx.strokeStyle=this.colors.bar_grid;
        this.ctx.beginPath();
        let gridstep=entity.maxposraw/10;
        for(let s=gridstep;s<entity.maxposraw;s+=gridstep)
         {
          let a=entity.getPos(s,width-bar_x);
          if(a<(dp-2))
           { 
            this.ctx.moveTo(bar_x+a,y+bar_yoffset+1);
            this.ctx.lineTo(bar_x+a,y+height);
           }
         }
        this.ctx.stroke();
       }
     }
   }
//#################################################################################################
  _drawBarItem(x, y, width, height,entity,baridx)
   {
    let bar_x;
    if(this.histmode>0) bar_x=x+this.metric.chartwidth+this.metric.iconwidth+this.metric.padding*2;
    else bar_x=x+this.metric.iconwidth+this.metric.padding;
//console.log(">>>>>>>>>>>>>>>>>>>>>>>>>",this.fonts.name,this.metric.nameheight)

    let bar_yoffset=this.metric.nameheight;//Math.trunc(height/2);
    let chart_x=x+this.metric.iconwidth+this.metric.padding;

    this.ctx.strokeStyle=this.colors.bar_frame;
    // Draw main bar and char frame
    this.ctx.fillStyle=this.colors.bar_bg;//this.colors.card_bg;
    this._roundRect(bar_x,y+bar_yoffset,width-bar_x+.5, height-bar_yoffset+.5,3,true,true);

    this.ctx.fillStyle=this.colors.chart_bg;//this.colors.card_bg
    if(this.histmode>0) this._roundRect(chart_x,y,this.metric.chartwidth+2,height+.5,0,true,true);

    // Text block
    this.ctx.textBaseline="top";//"middle"; 
    this.ctx.font=this.fonts.name;//"14px Roboto, Noto, sans-serif "//
    // Value
    let valstrwidth=0;
    let tvalstrwidth=0;
    if(Number(entity.d)>0)
     {
      // Form a string with the current value
      let curvalstr=entity.d+" "+entity.m;
      valstrwidth=this.ctx.measureText(curvalstr).width;
      this.ctx.fillStyle=this.colors.name;
      this.ctx.textAlign="end"; 
      this.ctx.fillText(curvalstr,width+.5,y+3);
     }
    // Tracked value
    let trval;
    if(this._tracker.data!=null&&this._tracker.data>0&&this._tracker.bar_id!=null&&this._tracker.bar_id==baridx&&(this.trackingmode==1||this.trackingmode==3))
     {
      trval=Number(this._tracker.data);
     }
    else if(this._tracker.hist_offset!=null&&this.trackingmode==4)
     {
      trval=Number(this._getBarHistData(baridx,this._tracker.hist_offset));
     }

    if(trval&&trval>0)
     {
      let curvalstr="";
      switch(this.trackingvalue)
       {
        case "min": curvalstr="⇓ ";break;
        case "avg": curvalstr="~ ";break;
        case "max":
        default:    curvalstr="⇑ ";break;
       }  

      curvalstr+=trval.toFixed(1)+" "+entity.m+" / ";
      tvalstrwidth=this.ctx.measureText(curvalstr).width;
      this.ctx.fillStyle=this.colors.chart_fg;
      this.ctx.textAlign="end"; 
      this.ctx.fillText(curvalstr,width+.5-valstrwidth,y+3);

     }


//console.log(entity.isempty)
    // Name
    this.ctx.fillStyle=(entity.isempty==true)?this.colors.bar_frame:this.colors.name;
    this.ctx.textAlign="start"; 
    this.ctx.fillText(entity.t,bar_x,y+3,(width-bar_x+.5)-(valstrwidth+tvalstrwidth+this.metric.padding));

    // Actual bar data
    if(entity.d>0)
     {
      this.ctx.fillStyle=entity.bar_fg;//?entity.bar_fg:this.colors.bar_fg;
      this._roundRect(bar_x+.5,y+bar_yoffset+.5,entity.getPos(entity.d,width-bar_x-1),height-bar_yoffset-.5,3,true,true);
     }
    // Tracked bar data
    if(this._tracker.data!=null&&this._tracker.data>0&&this._tracker.bar_id!=null&&this._tracker.bar_id==baridx&&(this.trackingmode==1||this.trackingmode==3))
     {
      this.ctx.fillStyle=this.colors.bar_tracker;
      this._roundRect(bar_x+.5,y+bar_yoffset+.5,entity.getPos(this._tracker.data,width-bar_x-1),height-bar_yoffset-.5,3,true,true);
     }
    else if(this._tracker.hist_offset!=null&&this.trackingmode==4)
     {
      let d=this._getBarHistData(baridx,this._tracker.hist_offset);
      if(d!=null&&d>0)
       {
        this.ctx.fillStyle=this.colors.bar_tracker;
        this._roundRect(bar_x+.5,y+bar_yoffset+.5,this._getPos(d,width-bar_x-1),height-bar_yoffset-.5,3,true,true);
       }
     }

    // Draw grid block
    this.ctx.strokeStyle=this.colors.bar_grid;
    // Bar grid
    this.ctx.beginPath();
    let gridstep=(entity.maxposraw)/10;
    for(let s=gridstep;s<entity.maxposraw;s+=gridstep)
     {
      let a=entity.getPos(s,width-bar_x);
      this.ctx.moveTo(bar_x+a,y+bar_yoffset+1);
      this.ctx.lineTo(bar_x+a,y+height);
     }
    this.ctx.stroke();

    //Draw chart
    if(this.histmode>0&&entity.h&&entity.h.length)
     {
      this.ctx.strokeStyle=this.colors.chart_fghalf;
      this.ctx.beginPath();
      for(let i=0;i<entity.h.length;i++)
       {
        if(entity.h[i]&&entity.h[i].mx)
         {
          let a=entity.getPos(entity.h[i].mx,height-2);
          this.ctx.moveTo(chart_x+i+1,y+height);
          this.ctx.lineTo(chart_x+i+1,(y+height-a));
         }
       }
      this.ctx.stroke();

      this.ctx.strokeStyle=this.colors.chart_fg;
//      this.ctx.fillStyle=this.colors.chart_fg;
      this.ctx.beginPath();
      for(let i=0;i<entity.h.length;i++)
       {
        if(entity.h[i]&&entity.h[i].v)
         {
          let a=entity.getPos(entity.h[i].v,height-2);
          this.ctx.moveTo(chart_x+i+1,y+height);
          this.ctx.lineTo(chart_x+i+1,(y+height-a));
//          this.ctx.fillRect(chart_x+i+1-.5,(y+height-a),1,1);
         }
       }
      this.ctx.stroke();
     }
    else if(this.histmode>0)
     {
      this.ctx.fillStyle=this.colors.bar_frame;
      this.ctx.textAlign="center"; 
      this.ctx.textBaseline="middle";
      if(entity.fl) this.ctx.fillText(this._getResString("ui.common.loading","Loading")+"...",chart_x+this.metric.chartwidth/2,y+1+height/2,this.metric.chartwidth);
      else this.ctx.fillText(this._getResString("ui.components.data-table.no-data","No data"),chart_x+this.metric.chartwidth/2,y+1+height/2,this.metric.chartwidth);
     }
    this._drawBarItemAnimationFrame(x, y, width, height,entity,baridx);
   }
//#################################################################################################
  _drawBarContent()
   {
    //this._rebuildColorValue();
    this.ctx.clearRect(0, 0,this.size_w,this.size_h);

    //this.ctx.fillStyle=this.colors.card_bg;
    //this.ctx.fillRect(0,0,this.size_w,this.size_h); 
    this.ctx.lineWidth=1;
    // Draw content
    let y=this.metric.padding;
    for(let e in this.barData)
     {
      let r_y=Math.round(y);   
      this._drawBarItem(this.metric.padding+.5,r_y+.5,this.size_w-(this.metric.padding+1),Math.round(this.metric.bar_h)-(this.metric.padding+.5),this.barData[e],e);
      y+=this.metric.bar_h;
     }
    if(this.histmode>0&&this._tracker.hist_offset!=null&&this.trackingmode>=2)
     {
      this.ctx.lineWidth=1;
      this.ctx.setLineDash([2,2]);
      this.ctx.strokeStyle=this.colors.tracker1;
      
      this.ctx.beginPath();
      this.ctx.moveTo(this.metric.iconwidth+this.metric.padding*2+.5+this._tracker.hist_offset+1,this.metric.padding);        
      this.ctx.lineTo(this.metric.iconwidth+this.metric.padding*2+.5+this._tracker.hist_offset+1,this.size_h-this.metric.padding);
      this.ctx.stroke();
      this.ctx.setLineDash([]);

      if(this._tracker.bar_id!=null)
       {
        // position
        let d=new Date(Date.now()-(146-(this._tracker.hist_offset+1))*this._scale);
        let s=" ≈"+d.toLocaleTimeString([],{hour: '2-digit', minute:'2-digit'})+" "; //   (146-(this._tracker.hist_offset+1))*this._scale;

        let m=this.ctx.measureText(s).width;

        this.ctx.fillStyle=this.colors.tracker1;
        this.ctx.textBaseline="middle";

        let s_x=this.metric.padding+.5+(this.metric.iconwidth+this.metric.padding);
        if(this._tracker.hist_offset>(this.metric.chartwidth/2)) this.ctx.textAlign="left",s_x+=this.metric.padding/2;
        else s_x+=this.metric.chartwidth-m;//this.metric.padding/2;
        let s_y=this.metric.padding/2+this.metric.bar_h*this._tracker.bar_id+1+this.metric.bar_h/2

        this.ctx.fillStyle=this.colors.card_bg;
        this._roundRect(s_x,s_y-(this.metric.nameheight/2+1),m,this.metric.nameheight,5,true,true);


        this.ctx.fillStyle=this.colors.tracker1;
        this.ctx.fillText(s,
                          s_x,
                          s_y,
                          this.metric.chartwidth);
       }


     }
   }
//#################################################################################################
  _drawAnimationFrame()
   {
    let y=this.metric.padding;
    for(let e in this.barData)
     {
      let r_y=Math.round(y);   
      this._drawBarItemAnimationFrame(this.metric.padding+.5,r_y+.5,this.size_w-(this.metric.padding+1),Math.round(this.metric.bar_h)-(this.metric.padding+.5),this.barData[e],e);
      y+=this.metric.bar_h;
     }
   }
//#################################################################################################
  _rebuildColorValue()
   {
    //console.dir(this.config.colors);

    let hsl;
    let isDarkMode=this._hass.themes.darkMode;
    this.colors={}

    //this.colors.card_bg=     this._compStyle.getPropertyValue("--mdc-theme-surface");
    this.colors.card_bg=     this._compStyle.getPropertyValue("--ha-card-background");
    if(!this.colors.card_bg) this.colors.card_bg=     this._compStyle.getPropertyValue("--card-background-color");
    if(!this.colors.card_bg) this.colors.card_bg=     "#fff";

    if(this.config.colors&&this.config.colors.frame) this.colors.bar_frame=this.config.colors.frame;
    else this.colors.bar_frame=   this._compStyle.getPropertyValue("--divider-color");

    if(this.config.colors&&this.config.colors.bar) this.colors.bar_fg=this.config.colors.bar;
    else this.colors.bar_fg=      this._compStyle.getPropertyValue("--mdc-theme-primary");

    hsl=this._rgbval(this._compStyle.getPropertyValue("--mdc-theme-secondary"));
    this.colors.bar_tracker= `rgba(${hsl[0]},${hsl[1]},${hsl[2]},.5)`;

    if(this.config.colors&&this.config.colors.chart) this.colors.chart_fg=this.config.colors.chart;
    else this.colors.chart_fg=    this._compStyle.getPropertyValue("--mdc-theme-secondary");

    //hsl=this._rgbToHsl(this.colors.chart_fg);
    //this.colors.chart_fghalf=this._hslToRgb(hsl[0],hsl[1],isDarkMode?hsl[2]-.25:hsl[2]+.25);
    hsl=this._rgbval(this.colors.chart_fg);
    this.colors.chart_fghalf=`rgba(${hsl[0]},${hsl[1]},${hsl[2]},.5)`;

    this.colors.bar_grid=  isDarkMode?"rgba(255,255,255,0.2)":"rgba(0,0,0,0.2)";
    this.colors.tracker1=    this._compStyle.getPropertyValue("--mdc-theme-primary");
    this.colors.iconoff=     this._compStyle.getPropertyValue("--mdc-theme-text-icon-on-background");
    this.colors.iconon=      this._compStyle.getPropertyValue("--mdc-theme-secondary");

    if(this.config.colors&&this.config.colors.fontcolor) this.colors.name=this.config.colors.fontcolor;
    else this.colors.name=        this._compStyle.getPropertyValue("--primary-text-color"); 

    if(this.config.colors&&this.config.colors.bar_bg) this.colors.bar_bg=this.config.colors.bar_bg;
    else this.colors.bar_bg=this.colors.card_bg;

    if(this.config.colors&&this.config.colors.chart_bg) this.colors.chart_bg=this.config.colors.chart_bg;
    else this.colors.chart_bg=this.colors.card_bg;
   }
//#################################################################################################
//  _roundDate(date)
//   {
//    let coeff=1000*this.GroupBySec;
//    return new Date(Math.floor(date.getTime() / coeff) * coeff);
//   }
//#################################################################################################
  _roundRect(x, y, width, height, radius, fill, stroke)
   {
    if(typeof stroke == 'undefined')  {stroke = true;}
    if(typeof radius === 'undefined') {radius = 5;}
    if(typeof radius === 'number')    {radius = {tl: radius, tr: radius, br: radius, bl: radius};}
    else 
     {
      let defaultRadius = {tl: 0, tr: 0, br: 0, bl: 0};
      for(let side in defaultRadius) {radius[side]=radius[side]||defaultRadius[side];}
     }
    this.ctx.beginPath();
    this.ctx.moveTo(x + radius.tl, y);
    this.ctx.lineTo(x + width - radius.tr, y);
    this.ctx.quadraticCurveTo(x + width, y, x + width, y + radius.tr);
    this.ctx.lineTo(x + width, y + height - radius.br);
    this.ctx.quadraticCurveTo(x + width, y + height, x + width - radius.br, y + height);
    this.ctx.lineTo(x + radius.bl, y + height);
    this.ctx.quadraticCurveTo(x, y + height, x, y + height - radius.bl);
    this.ctx.lineTo(x, y + radius.tl);
    this.ctx.quadraticCurveTo(x, y, x + radius.tl, y);
    this.ctx.closePath();
    if(fill)   {this.ctx.fill();}
    if(stroke) {this.ctx.stroke();}
   }
//#################################################################################################
  static getStubConfig()
   {
    //debugger
    return {title:"Optional card title",
            rangemax:2000, 
            entities:[{entity:"<enter base entity name>",
                       name:  "Parameter name",
                       icon:  "mdi:power-socket-de",
                       state: "<enter switch entity name>"}] 
           }
   }

 }

customElements.define("tdv-bar-card", TDVBarCard);

//#################################################################################################
window.customCards = window.customCards || [];
window.customCards.push({
  type: "tdv-bar-card",
  name: "TDV Bar",
  preview: true, // Optional - defaults to false
  description: "Bar chart oriented to display power sensors", // Optional
  documentationURL: "https://github.com/tdvtdv/ha-tdv-bar"
});
