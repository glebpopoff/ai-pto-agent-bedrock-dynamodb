const StorageAdapter = require('./StorageAdapter');
const config = require('../config/storage').storage;

class ExternalAPIAdapter extends StorageAdapter {
    constructor() {
        super();
        this.config = config.api;
        this.baseUrl = this.config.baseUrl;
        this.headers = this.config.headers;
    }

    async createPTORecord(record) {
        try {
            const response = await fetch(`${this.baseUrl}${this.config.endpoints.create}`, {
                method: 'POST',
                headers: this.headers,
                body: JSON.stringify(record)
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.status} - ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error creating PTO record:', error);
            throw error;
        }
    }

    async getPTORecord(id) {
        try {
            const endpoint = this.config.endpoints.read.replace(':id', id);
            const response = await fetch(`${this.baseUrl}${endpoint}`, {
                method: 'GET',
                headers: this.headers
            });

            if (!response.ok) {
                if (response.status === 404) {
                    return null;
                }
                throw new Error(`API error: ${response.status} - ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error getting PTO record:', error);
            throw error;
        }
    }

    async updatePTORecord(id, record) {
        try {
            const endpoint = this.config.endpoints.update.replace(':id', id);
            const response = await fetch(`${this.baseUrl}${endpoint}`, {
                method: 'PUT',
                headers: this.headers,
                body: JSON.stringify(record)
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.status} - ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error updating PTO record:', error);
            throw error;
        }
    }

    async deletePTORecord(id) {
        try {
            const endpoint = this.config.endpoints.delete.replace(':id', id);
            const response = await fetch(`${this.baseUrl}${endpoint}`, {
                method: 'DELETE',
                headers: this.headers
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.status} - ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error deleting PTO record:', error);
            throw error;
        }
    }

    async listPTORecords() {
        try {
            const response = await fetch(`${this.baseUrl}${this.config.endpoints.list}`, {
                method: 'GET',
                headers: this.headers
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.status} - ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error listing PTO records:', error);
            throw error;
        }
    }
}

module.exports = ExternalAPIAdapter;
