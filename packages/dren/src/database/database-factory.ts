import type { DatabaseAdapter, DatabaseConfig } from '../types.js';
import { MongoDBAdapter } from '../database/mongodb-adapter.js';

/**
 * Database Factory - Creates appropriate database adapters based on configuration
 */
export class DatabaseFactory {
  /**
   * Create a database adapter based on configuration
   */
  static createAdapter(config: DatabaseConfig): DatabaseAdapter {
    switch (config.type) {
      case 'mongodb':
        return new MongoDBAdapter(config);
      // Future database adapters can be added here
      // case 'cosmosdb':
      //   return new CosmosDBAdapter(config);
      // case 'postgresql':
      //   return new PostgreSQLAdapter(config);
      default:
        throw new Error(`Unsupported database type: ${config.type}`);
    }
  }

  /**
   * Get list of supported database types
   */
  static getSupportedTypes(): string[] {
    return ['mongodb'];
  }

  /**
   * Check if a database type is supported
   */
  static isSupported(type: string): boolean {
    return this.getSupportedTypes().includes(type);
  }
}
