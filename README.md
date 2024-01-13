# ha-tdv-bar
A Home Assistant lovelace card to display bar chart  oriented to display power sensors

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-41BDF5.svg?style=for-the-badge)](https://github.com/hacs/integration)


![Simple example card](img/main-image.png)


## Options

| Name              | Type    | Requirement  | Default             | Description                                 |
| ----------------- | ------- | ------------ | ------------------- | ------------------------------------------- |
| type              | string  | **Required** |                     | `custom:tdv-bar-card`
| title             | string  | **Optional** |                     | Optional header title for the card
| height            | number  | **Optional** |                     | The height of the card in pixels
| rangemax          | number  | **Optional** | 2000                | Maximum bar scale range
| histmode          | number  | **Optional** | 1                   | Historical chart display mode
|                   |         |              |                     |   0-hide 
|                   |         |              |                     |   1-show 
| scaletype         | string  | **Optional** | log10               | Scale type (linear or log10 )
| entities          | object  | **Required** |                     | Displayed entities. See [Entities](#Entities)

### Entities

| Name              | Type    | Requirement  | Default              | Description                                 |
| ----------------- | ------- | ------------ | -------------------- | ------------------------------------------- |
| entity            | string  | **Required** |                      | Entity id of the sensor
| icon              | string  | **Optional** |                      | Icon for this entity
| name              | string  | **Optional** |                      | Custom label for this entity
| state             | string  | **Optional** |                      | Change state entity id (e.g. switch)
| barcolor          | string  | **Optional** | Prymary system color | Individual bar color


### Example

```yaml
type: custom:tdv-bar-card
title: Energy consumers
scaletype: log10
rangemax: 2500
histmode: 1
entities:
  - entity: sensor.energomonitor_power
    icon: mdi:power-standby
    name: Total consumption
    barcolor: '#008000'
  - entity: sensor.speaker_power
    icon: mdi:speaker
    name: Speaker
    state: switch.dinamiki_na_kukhne
  - entity: sensor.energomonitor_fridge_power
    icon: mdi:fridge
    name: Fridge
  - entity: sensor.iot_power
    icon: mdi:alert-octagram-outline
    name: IOT
    state: switch.iot
```