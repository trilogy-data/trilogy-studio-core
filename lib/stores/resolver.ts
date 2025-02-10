

import axios from 'axios';

interface QueryResponse {
    data: {
        generated_sql: string
    }
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

    async resolve_query(query: string, dialect: string, type: string): Promise<QueryResponse> {
        if (type === 'sql') {
            // return it as is
            return { 'data': { 'generated_sql': query } }
        }
        return axios.post(`${this.address}/generate_query`, {
            query: query,
            dialect: dialect
        }).catch((error: Error) => {
            throw Error(this.getErrorMessage(error))
        })
    }
}

