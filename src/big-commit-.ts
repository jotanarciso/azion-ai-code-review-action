// Interfaces
interface UserData {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    permissions: Permission[];
    metadata: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
  }
  
  interface SystemConfig {
    environment: 'development' | 'staging' | 'production';
    features: FeatureFlag[];
    limits: SystemLimits;
    security: SecurityConfig;
  }
  
  interface SecurityConfig {
    maxLoginAttempts: number;
    passwordPolicy: PasswordPolicy;
    mfaEnabled: boolean;
    sessionTimeout: number;
  }
  
  interface PasswordPolicy {
    minLength: number;
    requireSpecialChars: boolean;
    requireNumbers: boolean;
    requireUppercase: boolean;
    maxAge: number;
  }
  
  interface SystemLimits {
    maxUsers: number;
    maxRequestsPerMinute: number;
    maxFileSize: number;
    maxConcurrentConnections: number;
  }
  
  interface FeatureFlag {
    name: string;
    enabled: boolean;
    rolloutPercentage: number;
    conditions?: Record<string, any>;
  }
  
  interface Permission {
    resource: string;
    action: 'create' | 'read' | 'update' | 'delete';
    conditions?: Record<string, any>;
  }
  
  enum UserRole {
    ADMIN = 'ADMIN',
    MANAGER = 'MANAGER',
    USER = 'USER',
    GUEST = 'GUEST',
  }
  
  // Utility Classes and Functions
  class ValidationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ValidationError';
    }
  }
  
  class SecurityError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'SecurityError';
    }
  }
  
  // Main System Class
  export class SystemManager {
    private static instance: SystemManager;
    private config: SystemConfig;
    private users: Map<string, UserData>;
    private activeConnections: Set<string>;
    private rateLimiter: Map<string, number[]>;
  
    private constructor() {
      this.config = this.loadDefaultConfig();
      this.users = new Map();
      this.activeConnections = new Set();
      this.rateLimiter = new Map();
    }
  
    public static getInstance(): SystemManager {
      if (!SystemManager.instance) {
        SystemManager.instance = new SystemManager();
      }
      return SystemManager.instance;
    }
  
    private loadDefaultConfig(): SystemConfig {
      return {
        environment: 'development',
        features: [
          {
            name: 'darkMode',
            enabled: true,
            rolloutPercentage: 100,
          },
          {
            name: 'betaFeatures',
            enabled: false,
            rolloutPercentage: 0,
          },
        ],
        limits: {
          maxUsers: 10000,
          maxRequestsPerMinute: 100,
          maxFileSize: 10485760, // 10MB
          maxConcurrentConnections: 1000,
        },
        security: {
          maxLoginAttempts: 5,
          passwordPolicy: {
            minLength: 8,
            requireSpecialChars: true,
            requireNumbers: true,
            requireUppercase: true,
            maxAge: 90, // days
          },
          mfaEnabled: true,
          sessionTimeout: 3600, // 1 hour
        },
      };
    }
  
    // User Management Methods
    public async createUser(userData: Omit<UserData, 'id' | 'createdAt' | 'updatedAt'>): Promise<UserData> {
      this.validateUserLimit();
      const id = this.generateUniqueId();
      const now = new Date();
      
      const newUser: UserData = {
        ...userData,
        id,
        createdAt: now,
        updatedAt: now,
      };
  
      this.validateUserData(newUser);
      this.users.set(id, newUser);
      await this.notifyUserCreation(newUser);
      
      return newUser;
    }
  
    public getUser(id: string): UserData {
      const user = this.users.get(id);
      if (!user) {
        throw new Error(`User not found: ${id}`);
      }
      return user;
    }
  
    public updateUser(id: string, updates: Partial<UserData>): UserData {
      const user = this.getUser(id);
      const updatedUser = {
        ...user,
        ...updates,
        updatedAt: new Date(),
      };
  
      this.validateUserData(updatedUser);
      this.users.set(id, updatedUser);
      return updatedUser;
    }
  
    public deleteUser(id: string): void {
      if (!this.users.delete(id)) {
        throw new Error(`User not found: ${id}`);
      }
    }
  
    // Security Methods
    public validatePermissions(userId: string, requiredPermissions: Permission[]): boolean {
      const user = this.getUser(userId);
      return requiredPermissions.every(required =>
        user.permissions.some(
          permission =>
            permission.resource === required.resource &&
            permission.action === required.action &&
            this.validatePermissionConditions(permission.conditions, required.conditions)
        )
      );
    }
  
    private validatePermissionConditions(
      userConditions?: Record<string, any>,
      requiredConditions?: Record<string, any>
    ): boolean {
      if (!requiredConditions) return true;
      if (!userConditions) return false;
  
      return Object.entries(requiredConditions).every(([key, value]) =>
        userConditions[key] === value
      );
    }
  
    // Rate Limiting
    public checkRateLimit(userId: string): boolean {
      const now = Date.now();
      const userRequests = this.rateLimiter.get(userId) || [];
      
      // Remove old requests
      const recentRequests = userRequests.filter(
        timestamp => now - timestamp < 60000
      );
  
      if (recentRequests.length >= this.config.limits.maxRequestsPerMinute) {
        return false;
      }
  
      recentRequests.push(now);
      this.rateLimiter.set(userId, recentRequests);
      return true;
    }
  
    // Feature Flag Management
    public isFeatureEnabled(featureName: string, userId?: string): boolean {
      const feature = this.config.features.find(f => f.name === featureName);
      if (!feature) return false;
      if (!feature.enabled) return false;
  
      if (userId) {
        const user = this.getUser(userId);
        if (user.role === UserRole.ADMIN) return true;
        
        // Check user-specific conditions
        if (feature.conditions) {
          return this.evaluateFeatureConditions(feature.conditions, user);
        }
      }
  
      return Math.random() * 100 < feature.rolloutPercentage;
    }
  
    private evaluateFeatureConditions(
      conditions: Record<string, any>,
      user: UserData
    ): boolean {
      return Object.entries(conditions).every(([key, value]) => {
        if (key.startsWith('metadata.')) {
          const metadataKey = key.split('.')[1];
          return user.metadata[metadataKey] === value;
        }
        return (user as any)[key] === value;
      });
    }
  
    // Connection Management
    public createConnection(userId: string): string {
      this.validateConnectionLimit();
      const connectionId = this.generateUniqueId();
      this.activeConnections.add(connectionId);
      return connectionId;
    }
  
    public closeConnection(connectionId: string): void {
      this.activeConnections.delete(connectionId);
    }
  
    // Validation Methods
    private validateUserLimit(): void {
      if (this.users.size >= this.config.limits.maxUsers) {
        throw new ValidationError('Maximum user limit reached');
      }
    }
  
    private validateConnectionLimit(): void {
      if (this.activeConnections.size >= this.config.limits.maxConcurrentConnections) {
        throw new ValidationError('Maximum connection limit reached');
      }
    }
  
    private validateUserData(userData: UserData): void {
      if (!userData.email.includes('@')) {
        throw new ValidationError('Invalid email format');
      }
  
      if (userData.name.length < 2) {
        throw new ValidationError('Name too short');
      }
  
      if (!Object.values(UserRole).includes(userData.role)) {
        throw new ValidationError('Invalid user role');
      }
    }
  
    // Utility Methods
    private generateUniqueId(): string {
      return Math.random().toString(36).substr(2, 9);
    }
  
    private async notifyUserCreation(user: UserData): Promise<void> {
      // Simulated async notification
      await new Promise(resolve => setTimeout(resolve, 100));
      console.log(`User created: ${user.id}`);
    }
  
    // System Configuration
    public updateConfig(updates: Partial<SystemConfig>): void {
      this.config = {
        ...this.config,
        ...updates,
      };
    }
  
    public getConfig(): SystemConfig {
      return { ...this.config };
    }
  
    // Metrics and Monitoring
    public getSystemMetrics(): SystemMetrics {
      return {
        totalUsers: this.users.size,
        activeConnections: this.activeConnections.size,
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime(),
      };
    }
  }
  
  interface SystemMetrics {
    totalUsers: number;
    activeConnections: number;
    memoryUsage: NodeJS.MemoryUsage;
    uptime: number;
  }
  
  // Error Handling
  export class ErrorHandler {
    private static errorLog: Error[] = [];
  
    public static handleError(error: Error): void {
      this.errorLog.push(error);
      console.error(`[${new Date().toISOString()}] ${error.name}: ${error.message}`);
      
      if (error instanceof SecurityError) {
        // Handle security-related errors
        this.handleSecurityError(error);
      } else if (error instanceof ValidationError) {
        // Handle validation errors
        this.handleValidationError(error);
      } else {
        // Handle unknown errors
        this.handleUnknownError(error);
      }
    }
  
    private static handleSecurityError(error: SecurityError): void {
      // Implement security error handling
      console.error('Security violation detected:', error.message);
    }
  
    private static handleValidationError(error: ValidationError): void {
      // Implement validation error handling
      console.warn('Validation failed:', error.message);
    }
  
    private static handleUnknownError(error: Error): void {
      // Implement unknown error handling
      console.error('Unknown error occurred:', error.message);
    }
  
    public static getErrorLog(): Error[] {
      return [...this.errorLog];
    }
  
    public static clearErrorLog(): void {
      this.errorLog = [];
    }
  }
  
  // Export utility functions
  export function isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
  
  export function formatDate(date: Date): string {
    return date.toISOString();
  }
  
  export function sanitizeInput(input: string): string {
    return input.replace(/[<>]/g, '');
  }
  
  export function generateHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }
  
  // Example usage and documentation
  /*
  const system = SystemManager.getInstance();
  
  // Create a new user
  const newUser = await system.createUser({
    name: 'John Doe',
    email: 'john@example.com',
    role: UserRole.USER,
    permissions: [
      { resource: 'posts', action: 'read' },
      { resource: 'comments', action: 'create' }
    ],
    metadata: {
      department: 'Engineering',
      location: 'Remote'
    }
  });
  
  // Update system configuration
  system.updateConfig({
    security: {
      ...system.getConfig().security,
      mfaEnabled: true
    }
  });
  
  // Check feature flags
  const isDarkModeEnabled = system.isFeatureEnabled('darkMode', newUser.id);
  
  // Handle errors
  try {
    // Some operation that might fail
    throw new SecurityError('Unauthorized access attempt');
  } catch (error) {
    ErrorHandler.handleError(error);
  }
  */