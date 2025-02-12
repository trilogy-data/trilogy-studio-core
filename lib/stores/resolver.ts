

import axios from 'axios';
import {Concept, Datasource} from '../models';

interface QueryResponse {
    data: {
        generated_sql: string
    }
}



interface ModelResponse {
    name: string,
    concepts: Concept[]
    datasources: Datasource[]
}

interface ContentInput{
    alias:string,
    contents:string
}


export default class AxiosResolver {
    address: string

    constructor(address: string) {
        this.address = address
    }
    getErrorMessage(error: Error): string {
        let base = 'An error occured.'
        if (axios.isAxiosError(error)) {
            base = error.message;
            if (error.response && error.response.data) {
                base = error.response.data.detail;
            }
        }
        return base;
    }

    async resolve_query(query: string, dialect: string, type: string, sources: ContentInput[] | null = null): Promise<QueryResponse> {
        if (type === 'sql') {
            // return it as is
            return { 'data': { 'generated_sql': query } }
        }
        return axios.post(`${this.address}/generate_query`, {
            query: query,
            dialect: dialect,
            sources: sources || []
        }).catch((error: Error) => {
            throw Error(this.getErrorMessage(error))
        })
    }

    async resolveModel(name: string, sources: ContentInput[]): Promise<ModelResponse> {
        return axios.post(`${this.address}/parse_model`, {
            name: name,
            sources: sources
        }).then((response) => { return response.data }).catch((error: Error) => {
            throw Error(this.getErrorMessage(error))
        })
    }
}

