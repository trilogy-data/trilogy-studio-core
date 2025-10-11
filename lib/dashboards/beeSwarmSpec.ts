
import { type ResultColumn } from '../editors/results'
import { type ChartConfig } from '../editors/results'
import { getFormatHint, createFieldEncoding, createInteractionEncodings } from './helpers'
import { lightDefaultColor, darkDefaultColor } from './constants'

const baseDataName = 'base'

export const createBeeSwarmSpec = (
    config: ChartConfig,
    columns: Map<string, ResultColumn>,
    tooltipFields: any[],
    encoding: any,
    isMobile: boolean,
    intChart: Array<Partial<ChartConfig>>,
    currentTheme: string = 'light',
    currentData: readonly Record<string, any>[] | null = null,
) => {
    let spec = {
        "$schema": "https://vega.github.io/schema/vega/v6.json",
        "description": "A beeswarm chart example that uses a force-directed layout to group items by category.",
        "width": 1000,
        "height": 600,
        "padding": { "left": 5, "right": 5, "top": 0, "bottom": 20 },
        "data": [
            {
                "name": baseDataName,
                "values": currentData?.slice(0, 1000) || [],
            }
        ],
        "scales": [
            {
                "name": "xscale",
                "type": "band",
                "domain": {
                    "data": baseDataName,
                    "field": config.xField,
                    "sort": true
                },
                "range": "width"
            },
            {
                "name": "color",
                "type": "ordinal",
                "domain": { "data": baseDataName, "field": config.xField },
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
                "tooltip": true,
                "from": { "data": baseDataName },
                "encode": {
                    "enter": {
                        "fill": { "scale": "color", "field": config.xField },
                        "xfocus": { "scale": "xscale", "field": config.xField, "band": 0.5 },
                        "yfocus": { "value": 50 },
                        
                                                // "tooltip": { "signal": `{'${[config.xField]}': datum.${config.xField}, 'Orbit': datum[${config.colorField}]" }` }
                        // "tooltip": { "signal": "{'Satellite': datum.name, 'Orbit': datum[config.yField]}" }
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

    console.log(spec)
    return spec
}