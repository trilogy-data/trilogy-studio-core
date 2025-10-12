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
    currentData: readonly Record<string, any>[],
    containerHeight: number,
    containerWidth: number,
) => {
    // Prepare scales array with conditional size scale
    const scales: any[] = [
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
            "domain": { "data": baseDataName, "field": config.colorField },
            "range": { "scheme": "category20c" }
        }
    ]
    
    // Add size scale if sizeField is provided
    if (config.sizeField) {
        scales.push({
            "name": "size",
            "type": "linear",
            "domain": { "data": baseDataName, "field": config.sizeField },
            "range": [40, 3000],
            "zero": false
        })
    }
    
    // Determine size encoding and collide radius
    const sizeEncoding = config.sizeField
        ? { "scale": "size", "field": config.sizeField }
        : { "value": 100 }
   
    const collideRadius = config.sizeField ? { "expr": "sqrt(datum.size) / 2" } : 5
    
    // Build tooltip fields dynamically
    const tooltipFieldsList = [config.xField, config.annotationField]
    if (config.colorField) {
        tooltipFieldsList.push(config.colorField)
    }
    if (config.sizeField) {
        tooltipFieldsList.push(config.sizeField)
    }
    
    const tooltipSignal = tooltipFieldsList
        .map(field => `'${field}': datum.${field}`)
        .join(', ')
    
    let spec = {
        "$schema": "https://vega.github.io/schema/vega/v6.json",
        "width": containerWidth,
        "height": containerHeight,
        "padding": 5,
        "data": [
            {
                "name": baseDataName,
                values: currentData,
            }
        ],
        "scales": scales,
        "axes": [
            { "orient": "bottom", "scale": "xscale" }
        ],
        "marks": [
            {
                "name": "nodes",
                "type": "symbol",
                "from": { "data": baseDataName },
                "encode": {
                    "enter": {
                        "fill": { "scale": "color", "field": config.colorField },
                        "xfocus": { "scale": "xscale", "field": config.xField, "band": 0.5 },
                        "yfocus": { "value": 50 },
                        "tooltip": { "signal": `{${tooltipSignal}}` }
                    },
                    "update": {
                        "size": sizeEncoding,
                        "stroke": { "value": "white" },
                        "strokeWidth": { "value": 1 },
                        "zindex": { "value": 0 }
                    },
                    "hover": {
                        "stroke": { "value": "blue" },
                        "strokeWidth": { "value": 1 },
                        "zindex": { "value": 1 }
                    }
                },
                "transform": [
                    {
                        "type": "force",
                        "iterations": 400,
                        "static": true,
                        "forces": [
                            { "force": "collide", "iterations": 1, "radius": collideRadius },
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