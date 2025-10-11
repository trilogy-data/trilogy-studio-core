
// import { type ResultColumn } from '../editors/results'
// import { type ChartConfig } from '../editors/results'
// import { getFormatHint, createFieldEncoding, createInteractionEncodings } from './helpers'
// import { lightDefaultColor, darkDefaultColor } from './constants'

export const createBeeSwarmSpec = (
    // config: ChartConfig,
    // columns: Map<string, ResultColumn>,
    // tooltipFields: any[],
    // encoding: any,
    // isMobile: boolean,
    // intChart: Array<Partial<ChartConfig>>,
    // currentTheme: string = 'light',
) => {
    return {
        "$schema": "https://vega.github.io/schema/vega/v6.json",
        "description": "A beeswarm chart example that uses a force-directed layout to group items by category.",
        "width": 1000,
        "height": 600,
        "padding": { "left": 5, "right": 5, "top": 0, "bottom": 20 },
        "data": [
            {
                "name": "satellites",
                "values": [
                    { "op_orbit": "MEO", "name": "Vanguard III" },
                    { "op_orbit": "MEO", "name": "Relay 1" },
                    { "op_orbit": "MEO", "name": "Hitchhiker 1" },
                    { "op_orbit": "MEO", "name": "Relay 2" },
                    { "op_orbit": "MEO", "name": "ATS 2" },
                    { "op_orbit": "MEO", "name": "RAE 1" },
                    { "op_orbit": "MEO", "name": "AE-C" },
                    { "op_orbit": "MEO", "name": "Kosmos-1413" },
                    { "op_orbit": "MEO", "name": "Kosmos-1414" },
                    { "op_orbit": "MEO", "name": "Kosmos-1415" },
                    { "op_orbit": "MEO", "name": "Kosmos-1490" },
                    { "op_orbit": "MEO", "name": "Kosmos-1491" },
                    { "op_orbit": "MEO", "name": "Kosmos-1492" },
                    { "op_orbit": "MEO", "name": "Kosmos-1519" },
                    { "op_orbit": "MEO", "name": "Kosmos-1520" },
                    { "op_orbit": "MEO", "name": "Kosmos-1521" },
                    { "op_orbit": "MEO", "name": "Kosmos-1554" },
                    { "op_orbit": "MEO", "name": "Kosmos-1555" },
                    { "op_orbit": "MEO", "name": "Kosmos-1556" },
                    { "op_orbit": "MEO", "name": "Kosmos-1593" },
                    { "op_orbit": "MEO", "name": "Kosmos-1594" },
                    { "op_orbit": "MEO", "name": "Kosmos-1595" },
                    { "op_orbit": "MEO", "name": "Kosmos-1650" },
                    { "op_orbit": "MEO", "name": "Kosmos-1651" },
                    { "op_orbit": "MEO", "name": "Kosmos-1652" },
                    { "op_orbit": "MEO", "name": "Kosmos-1710" },
                    { "op_orbit": "MEO", "name": "Kosmos-1711" },
                    { "op_orbit": "MEO", "name": "Kosmos-1712" },
                    { "op_orbit": "MEO", "name": "Kosmos-1778" },
                    { "op_orbit": "MEO", "name": "Kosmos-1779" },
                    { "op_orbit": "MEO", "name": "Kosmos-1780" },
                    { "op_orbit": "MEO", "name": "Kosmos-1883" },
                    { "op_orbit": "MEO", "name": "Kosmos-1884" },
                    { "op_orbit": "MEO", "name": "Kosmos-1885" },
                    { "op_orbit": "MEO", "name": "Kosmos-1946" },
                    { "op_orbit": "MEO", "name": "Kosmos-1947" },
                    { "op_orbit": "MEO", "name": "Kosmos-1948" },
                    { "op_orbit": "MEO", "name": "Kosmos-1970" },
                    { "op_orbit": "MEO", "name": "Kosmos-1971" },
                    { "op_orbit": "MEO", "name": "Kosmos-1972" },
                    { "op_orbit": "MEO", "name": "Kosmos-1987" },
                    { "op_orbit": "MEO", "name": "Kosmos-1988" },
                    { "op_orbit": "MEO", "name": "Kosmos-2022" },
                    { "op_orbit": "MEO", "name": "Kosmos-2023" },
                    { "op_orbit": "MEO", "name": "Kosmos-2079" },
                    { "op_orbit": "MEO", "name": "Kosmos-2080" },
                    { "op_orbit": "MEO", "name": "Kosmos-2081" },
                    { "op_orbit": "MEO", "name": "Kosmos-2109" },
                    { "op_orbit": "MEO", "name": "Kosmos-2110" },
                    { "op_orbit": "MEO", "name": "Kosmos-2111" },
                    { "op_orbit": "MEO", "name": "FAST" },
                    { "op_orbit": "MEO", "name": "USA 144" },
                    { "op_orbit": "MEO", "name": "ST-5 SC155" },
                    { "op_orbit": "MEO", "name": "ST-5 SC094" },
                    { "op_orbit": "MEO", "name": "ST-5 SC224" },
                    { "op_orbit": "MEO", "name": "IRNSS-R1H" },
                    { "op_orbit": "MEO", "name": "GSAT-6A" },
                    { "op_orbit": "MEO", "name": "USA 310" }
                ]
            }
        ],
        "scales": [
            {
                "name": "xscale",
                "type": "band",
                "domain": {
                    "data": "satellites",
                    "field": "op_orbit",
                    "sort": true
                },
                "range": "width"
            },
            {
                "name": "color",
                "type": "ordinal",
                "domain": { "data": "satellites", "field": "op_orbit" },
                "range": { "scheme": "category20c" }
            }
        ],
        "axes": [
            { "orient": "bottom", "scale": "xscale" }
        ],
        "marks": [
            {
                "name": "nodes",
                "type": "symbol",
                "from": { "data": "satellites" },
                "encode": {
                    "enter": {
                        "fill": { "scale": "color", "field": "op_orbit" },
                        "xfocus": { "scale": "xscale", "field": "op_orbit", "band": 0.5 },
                        "yfocus": { "value": 50 },
                        "tooltip": { "signal": "{'Satellite': datum.name, 'Orbit': datum.op_orbit}" }
                    },
                    "update": {
                        "size": { "value": 256 },
                        "stroke": { "value": "white" },
                        "strokeWidth": { "value": 1 },
                        "zindex": { "value": 0 }
                    },
                    "hover": {
                        "stroke": { "value": "purple" },
                        "strokeWidth": { "value": 3 },
                        "zindex": { "value": 1 }
                    }
                },
                "transform": [
                    {
                        "type": "force",
                        "iterations": 300,
                        "static": true,
                        "forces": [
                            { "force": "collide", "iterations": 1, "radius": 8 },
                            { "force": "x", "x": "xfocus", "strength": 0.2 },
                            { "force": "y", "y": "yfocus", "strength": 0.1 }
                        ]
                    }
                ]
            }
        ]
    }
}