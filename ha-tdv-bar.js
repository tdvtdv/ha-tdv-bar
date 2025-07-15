console.info("%c TDV-BAR-CARD %c v2.0.4b ", "color: #000000; background:#ffa600 ; font-weight: 700;", "color: #000000; background: #03a9f4; font-weight: 700;");

const LitElement = Object.getPrototypeOf(customElements.get("ha-panel-lovelace"));
const html = LitElement.prototype.html;
const css = LitElement.prototype.css;

class TDVBarCard extends LitElement//HTMLElement
 {
  static LocStr=
   {
    _isinited: false,
    nodata:  "No data",
    loading: "Loading",
   }
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  constructor()
   {
    super();
    this._timerId=null;
    this._Runtime=null;
    this._Entities=[];
    this._IsInited=false;
    this._broadcast=new BroadcastChannel("tdv-barv2");
    this._msecperday=86400000;        // msec per day
    this._scale=this._msecperday/144;
    this._timerId=null;
   }
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  static get styles()
   { 
    return css`
     .error                   {color: var(--error-color) !important;} 
     .muted                   {opacity: 0.2;}
     table                    {border: 0px solid red; border-collapse: collapse; margin: 10px auto 16px auto; width:calc(100% - 28px); }
     table.removetopmargin    {margin-top:0;}
     table .iconplace         {border: 0px solid green; width: 0; align:center;vertical-align:middle; margin:0;padding-right: 14px;}
     table .titleplace        
      {
       position: relative;
       white-space: nowrap;
       overflow: hidden; 
       max-width: 15px;
      }
     table .titleplace .tooltip
      {
       color: var(--mdc-theme-primary);
      }
     table .titleplace .tooltip,
     table .titleplace .title
      {
       overflow: hidden;
       text-overflow: ellipsis;
       position: absolute;
      }
     table .titleplace .measplace 
      {
/*
       display: inline;
       z-index: 1000;
       position: absolute;
       right: 0;
*/
       float: right;
       background-color: var(--card-background-color);
      } 
     table .titleplace .histmeasure {padding-right: .5rem;}
     table .chartplace        {border: 0px solid green; width: 0; align:center;vertical-align:bottom;font-size:0;}
     table .chartplace canvas {border: 1px solid transparent;margin: 0 5px 0 0;}
     table tbody:first-child tr .iconplace,table tbody:first-child tr .chartplace,table tbody:first-child tr .titleplace {padding-top: 5px;}
     table tbody:not(:first-child) tr .iconplace, table tbody:not(:first-child) tr .chartplace, table tbody:not(:first-child) tr .titleplace {padding-top: 5px;}
     table .barplace          {border: 0px solid green; width: 100%; align:center;vertical-align:bottom;font-size:0;}
     table .bar               {border: 1px solid transparent; width:100%; height: 20px;}
     table .grid              {stroke-linecap: square;stroke: transparent; stroke-width: 1px;visibility: hidden;}
     table .grid.active       {visibility: visible;}
    `;
   }
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // The user supplied configuration. Throw an exception and Home Assistant will render an error card.
  setConfig(config)
   {
console.log("TDV-BAR-CARD","+setConfig");

    if(this._Runtime!=null) return; //Prevent multiple call setConfig

    if(!config.entities) throw new Error("You need to define an entity");
    this.config=config;
    this._scaletype=String((this.config.scaletype)??"log10").toLowerCase();
    this._allownegativescale=parseInt(this.config.allownegativescale??"0");
    this._histmode=parseInt(this.config.histmode??"1");
    this._defaulticon=(this.config.defaulticon)??"mdi:power";
    this._rangemax=Number(this.config.rangemax??2000);
    this._animation=parseInt(this.config.animation??"1");
    this._trackingmode=parseInt(this.config.trackingmode??"1");

    this._color=
     {
      chart_bg:  this.config?.colors?.chart_bg||"var(--card-background-color)",
      chart_fg:  this.config?.colors?.chart||"var(--mdc-theme-secondary)",
      bar_bg:    this.config?.colors?.bar_bg||"var(--card-background-color)",
      bar:       this.config?.colors?.bar||"var(--mdc-theme-primary)",
      frame:     this.config?.colors?.frame||"var(--divider-color)",
      fontcolor: this.config?.colors?.fontcolor||"var(--primary-text-color)",
      iconoff:   "var(--mdc-theme-text-icon-on-background)",
      iconon:    "var(--mdc-theme-secondary)",
      tracker:   "var(--mdc-theme-primary)", //--state-device_tracker-active-color
      chart_fghalf: 0,
     }
    this._colorctx={}


    this._namepriority=parseInt(this.config.namepriority??"0");   //0-device name   1-entity name 2-friendly name

    // Prepare entities 
    let a;
    if(Array.isArray(this.config.entities)) a=this.config.entities; else a=[this.config.entities];
    a.forEach((e,i)=>
     {
      this._Entities[i]=
       {
        entity:    e.entity?e.entity.trim():null,
        icon:      e.icon||this._defaulticon,
        name:      e.name||null, 
        meas:      "",
        precision: 0,
        state:     e.state||null,
        barcolor:  e.barcolor||this._color.bar,
        rangemax:  Number(e.rangemax||this._rangemax),
       }
     });
console.log("TDV-BAR-CARD","-setConfig Item count:",this._Entities.length);
   }
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  render()
   {
    return html`<ha-card header="${this.config.title}"><table class="card-content ${this.config.title?'removetopmargin':''}">${this._Entities.map((e,i)=> html`
     <tbody id="item${i}" data-idx="${i}" @click=${this._pressItem} style="color: ${this._color.fontcolor}">
      <tr>
       <td rowspan="2" class="iconplace" data-idx="${i}" @click=${this._pressIcon}><ha-icon icon="${e.icon}" style="cursor:pointer;"></td>
       ${this._histmode?html`<td rowspan="2" class="chartplace"><canvas height="40" width="145" style="border-color:${this._color.frame};"></canvas></td>`:""}
       <td class="titleplace"><span class="title">${e.name}</span><span class="tooltip"></span> <span class="measplace"><span class="histmeasure" style="color:${this._color.chart_fg};"></span><span class="measure"></span></span></td>
      </tr>
      <tr>
       <td class="barplace">
        <svg id="b${i}" class="bar" style="border-color:${this._color.frame}; background-color: ${this._color.bar_bg};">
         <defs>
           <linearGradient id="gradient${i}" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="${e.barcolor}"><animate attributeName="offset" lr-from="-1"   lr-to="1"   rl-from="1"   rl-to="-1"   dur="1s"/></stop>
            <stop offset="0%" stop-color="#ffffff">      <animate attributeName="offset" lr-from="-0.5" lr-to="1.5" rl-from="1.5" rl-to="-0.5" dur="1s"/></stop>
            <stop offset="0%" stop-color="${e.barcolor}"><animate attributeName="offset" lr-from="0"    lr-to="2"   rl-from="2"   rl-to="0"    dur="1s"/></stop>
           </linearGradient>
           <mask id="waveMask${i}"><rect x="0" y="0" width="100%" height="100%" fill="url(#gradient${i})" opacity="1"/></mask>
         </defs>
         <rect id="r${i}" x="${this._allownegativescale?50:0}%" y="0" ry="25%" width="0%" height="100%" fill="${e.barcolor}" mask="url(#waveMask${i})"/>
         <rect id="hr${i}" x="${this._allownegativescale?50:0}%" y="0" ry="25%" width="0%" height="100%" fill="var(--mdc-theme-secondary)" opacity=".5"/>
         <g class="grid ${this._scaletype=='linear'&&this._allownegativescale==0?"active":""}" style="stroke:${this._color.frame}">
          <line x1="10%" y1="0" x2="10%" y2="100%" /><line x1="20%" y1="0" x2="20%" y2="100%" /><line x1="30%" y1="0" x2="30%" y2="100%" />
          <line x1="40%" y1="0" x2="40%" y2="100%" /><line x1="50%" y1="0" x2="50%" y2="100%" /><line x1="60%" y1="0" x2="60%" y2="100%" />
          <line x1="70%" y1="0" x2="70%" y2="100%" /><line x1="80%" y1="0" x2="80%" y2="100%" /><line x1="90%" y1="0" x2="90%" y2="100%" />
         </g>
         <g class="grid ${this._scaletype=='log10'&&this._allownegativescale==0?"active":""}" style="stroke:${this._color.frame}">
          <line x1="50.0%" y1="0" x2="50.0%" y2="100%" /><line x1="65.0%" y1="0" x2="65.0%" y2="100%" /><line x1="73.8%" y1="0" x2="73.8%" y2="100%" />
          <line x1="80.1%" y1="0" x2="80.1%" y2="100%" /><line x1="84.9%" y1="0" x2="84.9%" y2="100%" /><line x1="88.9%" y1="0" x2="88.9%" y2="100%" />
          <line x1="92.2%" y1="0" x2="92.2%" y2="100%" /><line x1="95.1%" y1="0" x2="95.1%" y2="100%" /><line x1="97.7%" y1="0" x2="97.7%" y2="100%" />
         </g>
         <g class="grid ${this._scaletype=='linear'&&this._allownegativescale==1?"active":""}" style="stroke:${this._color.frame}">
          <line x1=" 5%" y1="0" x2=" 5%" y2="100%" /><line x1="10%" y1="0" x2="10%" y2="100%" /><line x1="15%" y1="0" x2="15%" y2="100%" />
          <line x1="20%" y1="0" x2="20%" y2="100%" /><line x1="25%" y1="0" x2="25%" y2="100%" /><line x1="30%" y1="0" x2="30%" y2="100%" />
          <line x1="35%" y1="0" x2="35%" y2="100%" /><line x1="40%" y1="0" x2="40%" y2="100%" /><line x1="45%" y1="0" x2="45%" y2="100%" />
          <line x1="50%" y1="0" x2="50%" y2="100%" />
          <line x1="55%" y1="0" x2="55%" y2="100%" /><line x1="60%" y1="0" x2="60%" y2="100%" /><line x1="65%" y1="0" x2="65%" y2="100%" />
          <line x1="70%" y1="0" x2="70%" y2="100%" /><line x1="75%" y1="0" x2="75%" y2="100%" /><line x1="80%" y1="0" x2="80%" y2="100%" />
          <line x1="85%" y1="0" x2="85%" y2="100%" /><line x1="90%" y1="0" x2="90%" y2="100%" /><line x1="95%" y1="0" x2="95%" y2="100%" />
         </g>
         <g class="grid ${this._scaletype=='log10'&&this._allownegativescale==1?"active":""}" style="stroke:${this._color.frame}">
          <line x1=" 1.1%" y1="0" x2=" 1.1%" y2="100%" /><line x1=" 2.4%" y1="0" x2=" 2.4%" y2="100%" /><line x1=" 3.8%" y1="0" x2=" 3.8%" y2="100%" />
          <line x1=" 5.5%" y1="0" x2=" 5.5%" y2="100%" /><line x1=" 7.5%" y1="0" x2=" 7.5%" y2="100%" /><line x1=" 9.9%" y1="0" x2=" 9.9%" y2="100%" />
          <line x1="13.0%" y1="0" x2="13.0%" y2="100%" /><line x1="17.4%" y1="0" x2="17.4%" y2="100%" /><line x1="25.0%" y1="0" x2="25.0%" y2="100%" />
          <line x1="50%" y1="0" x2="50%" y2="100%" />
          <line x1="75.0%" y1="0" x2="75.0%" y2="100%" /><line x1="82.5%" y1="0" x2="82.5%" y2="100%" /><line x1="86.9%" y1="0" x2="86.9%" y2="100%" />
          <line x1="90.0%" y1="0" x2="90.0%" y2="100%" /><line x1="92.4%" y1="0" x2="92.4%" y2="100%" /><line x1="94.4%" y1="0" x2="94.4%" y2="100%" />
          <line x1="96.1%" y1="0" x2="96.1%" y2="100%" /><line x1="97.5%" y1="0" x2="97.5%" y2="100%" /><line x1="98.8%" y1="0" x2="98.8%" y2="100%" />
         </g>
        </svg>
       </td>
      </tr>
     </tbody>`)}</table></ha-card>`;
   }
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  firstUpdated()
   {
console.log("TDV-BAR-CARD","+firstUpdated");
    //Convert a css color variable to a regular web format color (for canvas use only)
    let compStyle=getComputedStyle(document.getElementsByTagName('body')[0]);
    for(let c in this._color)
     {
      if(this._color[c]&&this._color[c].trim().startsWith("var("))
       { 
        const match = this._color[c].match(/var\((.*?)\)/);
        if(match) this._colorctx[c]=compStyle.getPropertyValue(match[1]);
       }
      else this._colorctx[c]=this._color[c];
     }

    let hsl=this._rgbval(this._colorctx.chart_fg);
    this._color.chart_fghalf=this._colorctx.chart_fghalf=`rgba(${hsl[0]},${hsl[1]},${hsl[2]},.5)`;

    // Preparation of runtime data
    this._Runtime=[]; //this._Entities   this.config.entities
    this._Entities.forEach((e,i)=>
     {
      this._Runtime[i]=
       {
        base:    this.shadowRoot.querySelector(`#item${i}`),
        icon:    this.shadowRoot.querySelector(`#item${i} .iconplace ha-icon`),
        title:   this.shadowRoot.querySelector(`#item${i} .title`),
        tooltip: this.shadowRoot.querySelector(`#item${i} .tooltip`),
        bar:     this.shadowRoot.querySelector(`#r${i}`),
        histbar: this.shadowRoot.querySelector(`#hr${i}`),
        anim:    this.shadowRoot.querySelectorAll(`#b${i}.bar animate`),
        measure: this.shadowRoot.querySelector(`#item${i} .measure`),
        histmeasure: this.shadowRoot.querySelector(`#item${i} .histmeasure`),
        canvas:  this.shadowRoot.querySelector(`#item${i} canvas`),
        ctx:     null,
        w:       null,   // canvas context
        h:       null,   //     size
        isTrc:   false,  // Active tracking
        trPos:   -1,     // Tracking position ( if>=0 )

        val:     0,    //For change control
       };
      this._Runtime[i].tooltip.style.display="none";
      if(this._histmode)
       {
        this._Runtime[i].ctx=this._Runtime[i].canvas.getContext("2d");
        this._Runtime[i].ctx.textRendering="geometricPrecision";
        this._Runtime[i].w=this._Runtime[i].ctx.canvas.width;
        this._Runtime[i].h=this._Runtime[i].ctx.canvas.height;

        this._Runtime[i].canvas.addEventListener("mouseleave",(ev)=>
         {
          if(this._trackingmode){let trd={pos:null}; this._applayTrackData(trd,i); if(this._trackingmode==4) this._broadcast.postMessage(trd);}
         });

        this._Runtime[i].canvas.addEventListener("mousemove",(ev)=>
         {
          let mx,my;
          if(ev.offsetX||ev.offsetY){mx=ev.offsetX;my=ev.offsetY;} else {mx=ev.layerX;my=ev.layerY;} 
          if(this._trackingmode){let trd={pos:mx}; this._applayTrackData(trd,i); if(this._trackingmode==4) this._broadcast.postMessage(trd);}
         });

        this._broadcast.onmessage=(event)=>{this._applayTrackData(event.data,null);};

        this._drawChartContext(i);
       }
     }); 

    let hass=document.querySelector('home-assistant')?.hass;
    if(hass) this.hass=hass;
console.log("TDV-BAR-CARD","-firstUpdated");
   }
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  _rgbval(color)
   {
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
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// itemidx valid only for local card
  _applayTrackData(data,itemidx)
   {
    if(data)
     {
      this._Runtime.forEach((e,i)=>
       {
        if(data.pos==null)
         {
          this._Runtime[i].isTrc=false;
          this._Runtime[i].trPos=-1;
          this._drawChartContext(i);
          this._Runtime[i].histmeasure.textContent='';
          this._Runtime[i].histbar.setAttribute("width",`0`); 
          if(itemidx==i)
           {
            this._Runtime[i].tooltip.style.display="none";
            this._Runtime[i].title.style.display="inline";
           }

         } 
        else
         {
          this._Runtime[i].isTrc=true;
          this._Runtime[i].trPos=data.pos;
          this._drawChartContext(i);
          if((this._trackingmode==1&&itemidx==i)||(this._trackingmode==3&&itemidx==i)||this._trackingmode==4)
           {
            let d=this._getBarHistData(i,data.pos);
            //Update history bar text
            if(d.data) this._Runtime[i].histmeasure.textContent=`  ${d.mark} ${+Number(d.data).toFixed(this._Entities[i].precision)} ${this._Entities[i].meas} /`;
            else this._Runtime[i].histmeasure.textContent='';
            //Update history bar
            let prcval=this._getPos(i,Math.abs(d.data),this._allownegativescale?50:100);
            if(!this._allownegativescale&&d.data<0) this._Runtime[i].histbar.setAttribute("width",`0`); 
            else this._Runtime[i].histbar.setAttribute("width",`${prcval}%`);
            if(this._allownegativescale)
             {
              if(d.data<0) this._Runtime[i].histbar.setAttribute("x",`${50-prcval}%`); 
              else this._Runtime[i].histbar.setAttribute("x",`${50}%`);
             }
            if(itemidx==i)
             {

              let d=new Date(Date.now()-(144-(data.pos))*this._scale);
              let s="≈"+d.toLocaleTimeString([],{hour: '2-digit', minute:'2-digit'})+" "; //   (146-(this._tracker.hist_offset+1))*this._scale;
              this._Runtime[i].tooltip.textContent=s;      

              this._Runtime[i].title.style.display="none";
              this._Runtime[i].tooltip.style.display="inline";
             }
           }
         }
       });
     }
   }
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  _getBarHistData(BarIdx,HistIdx)
   {
    let data;
    if(BarIdx>=0&&BarIdx<this._Runtime.length&&this._Entities[BarIdx]&&this._Entities[BarIdx].h)
     {
      switch(this._trackingvalue)
       {
        case "min":
         {
          if(this._allownegativescale&&this._Entities[BarIdx].h[HistIdx]?.v<0) data=this._Entities[BarIdx].h[HistIdx]?.mx;
          else data=this._Entities[BarIdx].h[HistIdx]?.mn;

         } break
        case "avg": data=this._Entities[BarIdx].h[HistIdx]?.v;break
        case "max": 
        default:  
         {
          if(this._allownegativescale&&this._Entities[BarIdx].h[HistIdx]?.v<0) data=this._Entities[BarIdx].h[HistIdx]?.mn;
          else data=this._Entities[BarIdx].h[HistIdx]?.mx;
         } break
       } 
     }

    let mark;
    if(this._allownegativescale&&data<0) switch(this._trackingvalue)
     {
      case "min": mark="⇑";break;
      case "avg": mark="~";break;
      case "max":
      default:    mark="⇓";break;
     }  
    else switch(this._trackingvalue)
     {
      case "min": mark="⇓";break;
      case "avg": mark="~";break;
      case "max":
      default:    mark="⇑";break;
     }  

    return {data,mark};
   }
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  _drawChartContext(index)
   {
    if(this._Runtime&&index>=0&&index<this._Runtime.length)
     {
      let item=this._Runtime[index];
      let itemdata=this._Entities[index];
     
      item.ctx.fillStyle=this._colorctx.chart_bg;
      item.ctx.fillRect(0,0,item.w,item.h); 
      let zeroposchartoffset;
      if(this._allownegativescale) zeroposchartoffset=Math.round(item.h/2); else zeroposchartoffset=0;

      item.ctx.lineWidth=1;
      //Draw chart
      if(this._histmode>0&&itemdata.h&&itemdata.h.length)
       {
        // Min/Max
        item.ctx.strokeStyle=this._colorctx.chart_fghalf;
        item.ctx.beginPath();
        for(let i=0;i<itemdata.h.length;i++)
         {
          if(itemdata.h[i]&&itemdata.h[i].mx)
           {
            item.ctx.moveTo(i+.5,item.h-zeroposchartoffset);
            if(itemdata.h[i].v>0)
             {
              let a=this._getPos(index,Math.abs(itemdata.h[i].mx),item.h-zeroposchartoffset);
              item.ctx.lineTo(i+.5,((item.h-zeroposchartoffset)-a));
             } 
            else if(this._allownegativescale)
             {
              let a=this._getPos(index,Math.abs(itemdata.h[i].mn),item.h-zeroposchartoffset);
              item.ctx.lineTo(i+.5,((item.h-zeroposchartoffset)+a));
             }
           }
         }
        item.ctx.stroke();
        // Avg
  
        item.ctx.strokeStyle=this._colorctx.chart_fg;
        item.ctx.beginPath();
        for(let i=0;i<itemdata.h.length;i++)
         {
          if(itemdata.h[i]&&itemdata.h[i].v)
           {
            item.ctx.moveTo(i+.5,item.h-zeroposchartoffset);
            let a=this._getPos(index,Math.abs(itemdata.h[i].v),item.h-zeroposchartoffset);
            if(itemdata.h[i].v>0) item.ctx.lineTo(i+.5,((item.h-zeroposchartoffset)-a));
            else if(item._allownegativescale) item.ctx.lineTo(i+.5,((item.h-zeroposchartoffset)+a));
           }
         }
        item.ctx.stroke();
  
        // Draw zero line
        if(this._allownegativescale)
         {
          item.ctx.strokeStyle=this._colorctx.frame;
          item.ctx.beginPath();
          item.ctx.moveTo(0,item.h-zeroposchartoffset+.5);
          item.ctx.lineTo(item.w,item.h-zeroposchartoffset+.5);
          item.ctx.stroke();
         }

  
       }
      else if(this._histmode>0)
       {
        item.ctx.fillStyle=this._colorctx.frame;
        item.ctx.textAlign="center"; 
        item.ctx.textBaseline="middle";

        let fontArgs =  item.ctx.font.split(' ');
        item.ctx.font = '14px '+fontArgs[fontArgs.length - 1];

        if(itemdata.fl) item.ctx.fillText(TDVBarCard.LocStr.loading+"...",item.w/2,item.h/2,item.w);
        else item.ctx.fillText(TDVBarCard.LocStr.nodata,item.w/2,item.h/2,item.w);
       }


      //Draw track line
      if(this._trackingmode>1&&this._Runtime[index].trPos>=0)
       {
        item.ctx.lineWidth=1;
        item.ctx.setLineDash([2,2]);
        item.ctx.strokeStyle=this._colorctx.tracker;
      
        item.ctx.beginPath();
        item.ctx.moveTo(this._Runtime[index].trPos+.5,0);        
        item.ctx.lineTo(this._Runtime[index].trPos+.5,this._Runtime[index].h);
        item.ctx.stroke();
        item.ctx.setLineDash([]);
       }

     }
   }
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  _animateBar(index,direction)
   {
    if(this._animation)
     {
      this._Runtime[index].anim.forEach(elAnchor=>
       {
        let f,t;
        if(direction) f=elAnchor.getAttribute("lr-from"),t=elAnchor.getAttribute("lr-to");
        else f=elAnchor.getAttribute("rl-from"),t=elAnchor.getAttribute("rl-to");  

        elAnchor.setAttribute("from",f);
        elAnchor.setAttribute("to",t);

        let isRunning=true;
        try{elAnchor.getStartTime();} catch(e) {isRunning=false;}
        if(!isRunning) elAnchor.beginElement();
       });
     }
   }
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  _getPos(index,val,width)
   {
    switch(this._scaletype)
     {
      case "linear":
       {
        let a=val/(this._Entities[index].rangemax/width);
        return Math.min(a,width);
       } break;
      case "log10":
       {
        if(val>=1)
         {
          let a=Math.log10(val)/(Math.log10(this._Entities[index].rangemax)/width);
          return Math.min(a,width);
         }
        else return 0;
       } break;
     }
   }
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
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
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  _pressItem(ev)
   {
    ev.stopPropagation();
    let idx=ev.currentTarget.getAttribute("data-idx");
    if(idx)
     {
      idx=parseInt(idx);
      if(this._Entities[idx]&&this._Entities[idx].entity!=null)
       {
        this._fire("hass-more-info", { entityId: this._Entities[idx].entity });
       }
     }
   }
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  _pressIcon(ev)
   {
    ev.stopPropagation();
    let idx=ev.currentTarget.getAttribute("data-idx");
    if(idx)
     {
      idx=parseInt(idx);
      if(this._Entities[idx]&&this._Entities[idx].state!=null)
       {
        this._fire("hass-more-info", { entityId: this._Entities[idx].state });
       }
     }
    //this.hass.callService("button", "press", {entity_id: this.stateObj.entity_id,});
   }
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  async _fetchRecent(hass,entityId, start, end, skipInitialState, withAttributes)
   {
    let url='history/period';
    if(start) url+=`/${start.toISOString()}`;
    url+=`?filter_entity_id=${entityId}`;
    if(end) url+=`&end_time=${end.toISOString()}`;
    if(skipInitialState) url+='&skip_initial_state';
    if(!withAttributes)  url+='&minimal_response';
    if(withAttributes)   url+='&significant_changes_only=0';
    //url+=`&no_attributes&minimal_response&significant_changes_only=0`;
    return hass.callApi('GET', url);
   }
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  _buildDataArray(RawData,Start,Finish)
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
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  static async _reqHistEntityData(This,baridx,hass)
   {
    if(This._Runtime==null||This._Entities.length!=This._Runtime.length) return; //Let's break this strange chain of calls if there are anomalies.
    if(baridx==0)
     {
      let curdate=new Date();
      This.CurMoment=Math.trunc(curdate.getTime()/This._scale);
      This.StartMoment=Math.trunc((curdate.getTime()-(This._msecperday))/This._scale);//This.CurMoment-(24*60*60*1000);// one day

      This.ReqStart=new Date(curdate-This._msecperday);
      This.ReqEnd=curdate;
//console.log("start:",This.ReqStart);
//console.log("end:",This.ReqEnd);
     }
    This._Entities[baridx].fl=true;
    This._drawChartContext(baridx);
    if(This._Entities[baridx].entity)
     {
      let data_raw=await This._fetchRecent(hass,This._Entities[baridx].entity,This.ReqStart,This.ReqEnd,false,false);
      if(data_raw&&data_raw.length&&data_raw[0]&&data_raw[0].length)
       {
        let da=This._buildDataArray(data_raw[0],This.StartMoment,This.CurMoment);
        This._Entities[baridx].h=da.data;
        //This._Entities[baridx].isempty=!da.isactive;
        if(da.isactive) This._Runtime[baridx].title.classList.remove("muted");
        else This._Runtime[baridx].title.classList.add("muted");
       }
     }
    This._Entities[baridx].fl=false;
    This._drawChartContext(baridx);
    baridx++;

    if(baridx<This._Entities.length)
     {
      setTimeout(TDVBarCard._reqHistEntityData,100,This,baridx,hass);
     }
    else
     {
      setTimeout(TDVBarCard._reqHistEntityData,300000,This,0,hass);
     }
   }

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // Whenever the state changes, a new `hass` object is set. Use this to update your content.
  set hass(hass)
   {
    if(!this._IsInited&&hass)
     {
console.log("TDV-BAR-CARD","set hass - init");

      if(!TDVBarCard.LocStr._isinited)
       {
        TDVBarCard.LocStr.loading=hass.localize("ui.common.loading")||TDVBarCard.LocStr.loading;
        TDVBarCard.LocStr.nodata=hass.localize("ui.components.data-table.no-data")||TDVBarCard.LocStr.nodata;
        TDVBarCard.LocStr._isinited=true;
       }
      this._Entities.forEach((e,i)=>
       {
        if(e.entity&&hass.entities[e.entity])
         {
          if(!e.name)
           {
            switch(this._namepriority)
             {
              case 0: e.name=hass.devices[hass.entities[e.entity].device_id].name;break; // Device name
              case 1: e.name=hass.entities[e.entity].name;break;                         // Entity name
             }
           }
          e.precision=hass.entities[e.entity].display_precision??e.precision;
          e.meas=hass.states[e.entity].attributes.unit_of_measurement??e.meas;
         }
       });

      // if some bar defined start history data requester timer
      if(this._Entities.length)
       {
        if(this._histmode>0) setTimeout(TDVBarCard._reqHistEntityData,100,this,0,hass);
       }
    
      this._IsInited=true;
     }

    if(this._Runtime&&this._Runtime.length==this._Entities.length)
     {
      this._Entities.forEach((e,i)=>
       {
        if(e.entity&&e.entity in hass.entities)
         {
          this._Runtime[i].base.classList.remove('error');
          let val=this._Runtime[i].value=Number(hass.states[e.entity].state);
          if(isNaN(val))
           {
            this._Runtime[i].measure.textContent='?';
            this._Runtime[i].bar.setAttribute("width",`0`); 
           }
          else if(this._Runtime[i].val!=val)
           {
            //Update bar text
            if(val!=0) this._Runtime[i].measure.textContent=`${+Number(val).toFixed(this._Entities[i].precision)} ${this._Entities[i].meas}`;
            else this._Runtime[i].measure.textContent='';
            //Update bar
            let prcval=this._getPos(i,Math.abs(val),this._allownegativescale?50:100);
            if(!this._allownegativescale&&val<0) this._Runtime[i].bar.setAttribute("width",`0`); 
            else this._Runtime[i].bar.setAttribute("width",`${prcval}%`);
            if(this._allownegativescale)
             {
              if(val<0) this._Runtime[i].bar.setAttribute("x",`${50-prcval}%`); 
              else this._Runtime[i].bar.setAttribute("x",`${50}%`);
             }
            this._animateBar(i,this._Runtime[i].val<val);
            this._Runtime[i].val=val;
           }
          //Update icon
          let ison=false;
          if(this._Entities[i].state&&hass.states[this._Entities[i].state]) ison=(hass.states[this._Entities[i].state].state=="on");
          else ison=(val!=0);//if on/off entity state is not defined the use base state
          this._Runtime[i].icon.setAttribute("style",`color:${ison?this._color.iconon:this._color.iconoff}`);
         }
        else
         {
          this._Runtime[i].base.classList.add('error');
          this._Runtime[i].measure.textContent=`Error`;

console.log("TDV-BAR-CARD","Entities len:",this._Entities.length,"Entity:",e.entity,"Index",i,"Obj:",hass.states[e.entity]);

         }
       });
//      this._hassForPreview=null;
     }// else this._hassForPreview=hass; 

   }
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // The height of your card. Home Assistant uses this to automatically distribute all cards over the available columns in masonry view
  getCardSize()
   {
    return this._Entities.length??3;
   }
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // The rules for sizing your card in the grid in sections view
  getGridOptions()
   {
    return {rows:this._Entities.length??5, columns:12, min_rows:1, max_rows:30};
   }
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  static getStubConfig()
   {
    //debugger
    let hass=document.querySelector('home-assistant')?.hass;
    if(hass)
     {
      let cfg={entities:[]};
      for(let i in hass.states)
       {
        if(i.startsWith("sensor.")&&i.endsWith("_power"))
         {
          if(cfg.entities.push({entity:i})>2) break;
         }
       }
      return cfg;
     }
    else return {title:null,entities:[{entity:"<enter base entity name>",name:"Parameter name",icon:  "mdi:power-socket-de",state: "<enter switch entity name>"}] }
   }
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  static getConfigElement()
   {
    return document.createElement("tdv-bar-card-editor");
   }

 }

customElements.define("tdv-bar-card", TDVBarCard);

//#################################################################################################
class TDVBarCardEditor extends LitElement
 {
  constructor()
   {
    super();
    this._config={entities:[]};
    this.OpenEntityIndex=null;
    this.hass=document.querySelector('home-assistant')?.hass;
   }
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//https://github.com/thomasloven/hass-config/wiki/PreLoading-Lovelace-Elements
  async _loadEntityPicker()
   {
    if(customElements.get("ha-entity-picker")) return;
    const ch = await window.loadCardHelpers(); 
    const c = await ch.createCardElement({ type: "entities", entities: [] });
    await c.constructor.getConfigElement();
   }
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  firstUpdated()
   {
    this._loadEntityPicker();
   }
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  setConfig(config)
   {
    this._config=config;
    if(!this._config.entities) this._config.entities=[];

    this._config.allownegativescale=parseInt(config?.allownegativescale??"0");
    this._config.histmode=parseInt(config?.histmode??"1");
    this._config.animation=parseInt(config?.animation??"1");
    this._config.trackingmode=parseInt(config?.trackingmode??"1");
    this._config.trackingvalue=config?.trackingvalue??"max";

    this.requestUpdate();
   }
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  configChanged(newConfig)
   {
    const event = new Event("config-changed", {bubbles: true,composed: true});
    event.detail = { config: newConfig };
    this.dispatchEvent(event);
   }
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  _valueChanged(event, key, isNum=false)
   {
    if(!this._config) return;
//    if(event.target.tagName.toLowerCase()=="ha-select"&&!event.target.value) return;  //Select can't be empty


    let newConfig=structuredClone(this._config); //JSON.parse(JSON.stringify(this._config));
    let currentLevel=newConfig;

    if(key.includes('.'))
     {
      const parts = key.split('.');
      for(let i=0;i<parts.length-1;i++) 
       {
        if(!currentLevel[parts[i]]) currentLevel[parts[i]]={};
        currentLevel=currentLevel[parts[i]];
       }
      key=parts[parts.length-1];
     }   

    if(event.target.checked !== undefined) currentLevel[key] = event.target.checked?1:0;
    else 
     {
//console.log("*************",key,typeof(event.target.value),event.target.value)
//debugger
      if(!event.target.value) delete currentLevel[key];
      else currentLevel[key] = isNum?Number(event.target.value):event.target.value;
     }

    this.configChanged(newConfig);
    this.requestUpdate();
   }
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  _removeEntity(ev)
   {
    ev.stopPropagation();

    const index = ev.currentTarget.index;
    if(index>=this._config.entities.length) return;

    let newConfig=structuredClone(this._config); //JSON.parse(JSON.stringify(this._config));
    newConfig.entities.splice(index, 1);

    this.configChanged(newConfig);
    this.requestUpdate();

   }
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  _addEntity(ev)
   {
    const value = ev.detail.value;
    if(!value) return;

    let newConfig=structuredClone(this._config); //JSON.parse(JSON.stringify(this._config));
    newConfig.entities.push({entity:value});

    ev.target.value = "";

    this.configChanged(newConfig);
    this.requestUpdate();
   }
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  _editEntity(ev)
   {
    const value = ev.detail.value;
    const index = ev.target.index;
    if(index>=this._config.entities.length) return;

    let newConfig=structuredClone(this._config); //JSON.parse(JSON.stringify(this._config));
    newConfig.entities[index].entity=value;

    this.configChanged(newConfig);
    this.requestUpdate();
   }
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  _openEntity(ev)
   {
    ev.stopPropagation();

    const index = ev.currentTarget.index;
    if(index>=this._config.entities.length) return;
    this.OpenEntityIndex=index;

    this.requestUpdate();
   }
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  _returnToList(ev)
   {
    this.OpenEntityIndex=null;
    this.requestUpdate();
   }
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  _entityMoved(ev)
   {
    ev.stopPropagation();
    const { oldIndex, newIndex } = ev.detail;

    if(oldIndex>=this._config.entities.length||newIndex>=this._config.entities.length) return;

    let newConfig=structuredClone(this._config); //JSON.parse(JSON.stringify(this._config));

    const [element] = newConfig.entities.splice(oldIndex, 1);
    newConfig.entities.splice(newIndex, 0, element);

    this.configChanged(newConfig);
    this.requestUpdate();
  }
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// margin: 0 4px; --text-field-padding: 8px;
  static get styles()
   { 
    return css`
        .switch-label {padding-left: 14px;}
        .switch-right {display: flex; flex-direction: row; align-items: center;}
        .textfield-container { display: flex; flex-direction: column; margin-bottom: 10px; gap: 20px; }
        .flex-smallcontainer,
        .flex-container { display: flex; flex-direction: row; gap: 20px; margin-bottom: 10px; }
        .flex-container ha-textfield,
        .flex-container ha-icon-picker,
        .flex-container ha-select {flex-basis: 50%;  flex-grow: 1;}
        .flex-container .switch-container {flex-basis: 50%; flex-grow: 1;}
        .flex-smallcontainer .switch-container { flex-basis: 33%; flex-grow: 1;}
        ha-entity-picker {margin-top: 8px;overflow:hidden;}
        .entity {display: flex;align-items: center;}
        .entity .handle {padding-right: 8px; cursor: move; cursor: grab; padding-inline-end: 8px; padding-inline-start: initial; direction: var(--direction);}
        .entity .handle > * {pointer-events: none;}
        .entity ha-entity-picker {flex-grow: 1;}
        .entity .edit-icon, .entity .remove-icon { --mdc-icon-button-size: 36px; color: var(--secondary-text-color);}
        .add-entity {display: block; margin-left: 31px; margin-right: 71px; margin-inline-start: 31px; margin-inline-end: 71px; direction: var(--direction);}
        h3 {margin-bottom: 0.5em;}
        .entity-block h3 {margin-top: 0;}
        .entity-block h3 ha-icon-button, .entity-blockhdr h3 span {vertical-align: middle;}
	.entity-sub {margin-left: 2em;margin-top: 10px;}
	.entity-sub ha-entity-picker {margin-top: 0;}
    `;
   }
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  _buildEntitysList()
   {
    let mdiClose="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"; 
    let mdiPencil="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z";
    return html`
	<h3>Entitys</h3>
	<ha-sortable handle-selector=".handle" @item-moved=${this._entityMoved}>
	 <div class="entities">
	  ${this._config.entities.map((e,i)=>
	   {
	    return html`
	     <div class="entity">
	      <div class="handle"><ha-icon icon="mdi:drag"></ha-icon></div>
	      <ha-entity-picker allow-custom-entity .hass=${this.hass} .value=${e.entity} .index=${i}  @value-changed=${this._editEntity}></ha-entity-picker>
	      <ha-icon-button label="Remove entity" .path=${mdiClose} class="remove-icon" .index=${i} @click=${this._removeEntity}></ha-icon-button>
	      <ha-icon-button label="Edit entity" .path=${mdiPencil}  class="edit-icon" .index=${i} @click=${this._openEntity}></ha-icon-button>
	     </div>`;
	   })}
	 </div>
	</ha-sortable>
	<ha-entity-picker class="add-entity" allow-custom-entity .hass=${this.hass} .value=${null} @value-changed=${this._addEntity}></ha-entity-picker>`;
   }
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  _buildEntityBlock()
   {
    let mdiLeft="M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z";
    return html`
	<div class="entity-block">
	 <h3><ha-icon-button label="Return" .path=${mdiLeft} class="return-icon" @click=${this._returnToList}></ha-icon-button><span>Entity property</span></h3>
	 <ha-entity-picker allow-custom-entity .hass=${this.hass} .value=${this._config.entities[this.OpenEntityIndex].entity} .disabled=${true} ></ha-entity-picker>
	 <div class="entity-sub">
	  <div class="textfield-container">
	   <ha-textfield label="Name" .value="${this._config.entities[this.OpenEntityIndex]?.name||''}"  @change="${(e) => this._valueChanged(e, `entities.${this.OpenEntityIndex}.name`)}"></ha-textfield>
	  </div>
	  <div class="flex-container">
	   <ha-icon-picker label="Icon" .value=${this._config.entities[this.OpenEntityIndex]?.icon||null} @value-changed=${(e) => this._valueChanged(e,`entities.${this.OpenEntityIndex}.icon`)}></ha-icon-picker>
	  </div>
	  <div class="flex-container">
	   <ha-textfield label="Bar color" .value="${this._config.entities[this.OpenEntityIndex]?.barcolor||''}"  @change="${(e) => this._valueChanged(e,`entities.${this.OpenEntityIndex}.barcolor`)}"></ha-textfield>
	   <ha-textfield label="Max range" type="number" .value="${this._config.entities[this.OpenEntityIndex]?.rangemax||''}" @change="${(e) => this._valueChanged(e,`entities.${this.OpenEntityIndex}.rangemax`,true)}"></ha-textfield>
	  </div>
	  <div class="textfield-container">
	   <ha-entity-picker allow-custom-entity label="State (like a switch)" .hass=${this.hass} .value=${this._config.entities[this.OpenEntityIndex]?.state||null}  @value-changed=${(e) => this._valueChanged(e,`entities.${this.OpenEntityIndex}.state`)}></ha-entity-picker>
	  </div>
	 </div>
	</div>
     `;
   }
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  render()
   {
    return html`
<div>
 <div class="textfield-container">
  <ha-textfield label="Title" .value="${this._config.title||''}"  @change="${(e) => this._valueChanged(e, 'title')}"></ha-textfield>
 </div>
 <div class="flex-container">
  <ha-select naturalMenuWidth fixedMenuPosition label="Scale type" .value=${this._config.scaletype} @change=${(e) => this._valueChanged(e, 'scaletype')} @closed=${(ev) => ev.stopPropagation()}>
   <ha-list-item .value=${'linear'}>Linear</ha-list-item>
   <ha-list-item .value=${'log10'}>Logarithmic</ha-list-item>
  </ha-select>
  <ha-textfield label="Max range" type="number" .value="${this._config.rangemax||'2000'}" @change="${(e) => this._valueChanged(e,'rangemax',true)}"></ha-textfield>
 </div>
 <div class="flex-container">
  <ha-select naturalMenuWidth fixedMenuPosition label="Mouse tracking mode" .value=${String(this._config.trackingmode)} @change=${(e) => this._valueChanged(e, 'trackingmode',true)} @closed=${(ev) => ev.stopPropagation()}>
   <ha-list-item .value=${'0'}>Disable</ha-list-item>
   <ha-list-item .value=${'1'}>Bar</ha-list-item>
   <ha-list-item .value=${'2'}>History</ha-list-item>
   <ha-list-item .value=${'3'}>Bar and history</ha-list-item>
   <ha-list-item .value=${'4'}>All bars and history</ha-list-item>
  </ha-select>
  <ha-select naturalMenuWidth fixedMenuPosition label="Type of value to be tracked" .value=${this._config.trackingvalue} @change=${(e) => this._valueChanged(e, 'trackingvalue')} @closed=${(ev) => ev.stopPropagation()}>
   <ha-list-item .value=${'min'}>Min</ha-list-item>
   <ha-list-item .value=${'avg'}>Avg</ha-list-item>
   <ha-list-item .value=${'max'}>Max</ha-list-item>
  </ha-select>
 </div>
 <div class="flex-container">
  <div class="switch-container switch-right">
   <ha-switch @change="${(e)=>this._valueChanged(e,'histmode')}" .checked="${this._config.histmode===1}"></ha-switch><label class="switch-label"> History chart </label>
  </div>
  <div class="switch-container switch-right">
   <ha-switch @change="${(e)=>this._valueChanged(e,'animation')}" .checked="${this._config.animation===1}"></ha-switch><label class="switch-label"> Bar animation </label>
  </div>
  <div class="switch-container switch-right">
   <ha-switch @change="${(e)=>this._valueChanged(e,'allownegativescale')}" .checked="${this._config.allownegativescale===1}"></ha-switch><label class="switch-label"> Allow negative values </label>
  </div>
 </div>
 <div class="flex-container">
  <ha-select naturalMenuWidth fixedMenuPosition label="Name selection priority" .value=${String(this._config.namepriority)} @change=${(e) => this._valueChanged(e, 'namepriority',true)} @closed=${(ev) => ev.stopPropagation()}>
   <ha-list-item .value=${'0'}>Device name</ha-list-item>
   <ha-list-item .value=${'1'}>Entity name</ha-list-item>
  </ha-select>
  <ha-icon-picker label="Default entity icon" .value=${this._config.defaulticon} @value-changed=${(e)=>{this._valueChanged(e, 'defaulticon')} }></ha-icon-picker>
 </div>
 <div class="flex-container">
  <ha-textfield label="Bar background color" .value="${this._config?.colors?.bar_bg||''}"  @change="${(e) => this._valueChanged(e, 'colors.bar_bg')}"></ha-textfield>
  <ha-textfield label="Bar color" .value="${this._config?.colors?.bar||''}"  @change="${(e) => this._valueChanged(e, 'colors.bar')}"></ha-textfield>
 </div>
 <div class="flex-container">
  <ha-textfield label="Chart background color" .value="${this._config?.colors?.chart_bg||''}"  @change="${(e) => this._valueChanged(e, 'colors.chart_bg')}"></ha-textfield>
  <ha-textfield label="Chart color" .value="${this._config?.colors?.chart||''}"  @change="${(e) => this._valueChanged(e, 'colors.chart')}"></ha-textfield>
 </div>
 <div class="flex-container">
  <ha-textfield label="Chart and bar frame color" .value="${this._config?.colors?.frame||''}"  @change="${(e) => this._valueChanged(e, 'colors.frame')}"></ha-textfield>
  <ha-textfield label="The color of the entity name and data" .value="${this._config?.colors?.fontcolor||''}"  @change="${(e) => this._valueChanged(e, 'colors.fontcolor')}"></ha-textfield>
 </div>
 ${this.OpenEntityIndex==null?this._buildEntitysList():this._buildEntityBlock()}
</div>`;
   }
 }

customElements.define("tdv-bar-card-editor", TDVBarCardEditor);

//#################################################################################################
window.customCards = window.customCards || [];
window.customCards.push({
  type: "tdv-bar-card",
  name: "TDV Bar",
  preview: true,
  description: "Bar chart oriented to display power sensors",
  documentationURL: "https://github.com/tdvtdv/ha-tdv-bar"
});
