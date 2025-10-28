import type { ExecutionTiming } from './types.js';

/**
 * Execution timer utility for tracking method-level performance
 */
export class ExecutionTimer {
  private timings: ExecutionTiming[] = [];
  private currentTiming: { method: string; startTime: Date } | null = null;

  /**
   * Start timing a method execution
   */
  start(method: string): void {
    if (this.currentTiming) {
      throw new Error(`Already timing method: ${this.currentTiming.method}`);
    }

    this.currentTiming = {
      method,
      startTime: new Date(),
    };
  }

  /**
   * End timing the current method
   */
  end(): ExecutionTiming {
    if (!this.currentTiming) {
      throw new Error('No active timing to end');
    }

    const endTime = new Date();
    const duration = endTime.getTime() - this.currentTiming.startTime.getTime();

    const timing: ExecutionTiming = {
      method: this.currentTiming.method,
      startTime: this.currentTiming.startTime,
      endTime,
      duration,
    };

    this.timings.push(timing);
    this.currentTiming = null;

    return timing;
  }

  /**
   * Get all recorded timings
   */
  getTimings(): ExecutionTiming[] {
    return [...this.timings];
  }

  /**
   * Get timing summary by method
   */
  getMethodBreakdown(): Record<string, number> {
    const breakdown: Record<string, number> = {};

    for (const timing of this.timings) {
      if (breakdown[timing.method]) {
        breakdown[timing.method] += timing.duration;
      } else {
        breakdown[timing.method] = timing.duration;
      }
    }

    return breakdown;
  }

  /**
   * Get total execution time
   */
  getTotalExecutionTime(): number {
    return this.timings.reduce((total, timing) => total + timing.duration, 0);
  }

  /**
   * Clear all timings
   */
  clear(): void {
    this.timings = [];
    this.currentTiming = null;
  }
}

/**
 * Higher-order function to wrap processor methods with timing
 */
export function withTiming<T extends any[], R>(
  method: (...args: T) => Promise<R>,
  methodName: string,
  timer: ExecutionTimer
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    timer.start(methodName);
    try {
      const result = await method(...args);
      timer.end();
      return result;
    } catch (error) {
      timer.end();
      throw error;
    }
  };
}

/**
 * Decorator for automatic method timing
 */
export function timed(methodName?: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const name = methodName || `${target.constructor.name}.${propertyKey}`;

    descriptor.value = async function (...args: any[]) {
      const timer = (this as any).executionTimer || new ExecutionTimer();
      return withTiming(originalMethod.bind(this), name, timer)(...args);
    };

    return descriptor;
  };
}

/**
 * Create a processor wrapper that automatically tracks execution timing
 */
export function createMonitoredProcessor<T>(
  processor: (payload: T, context: any) => Promise<any>,
  processorName: string
): (payload: T, context: any) => Promise<any> {
  return async (payload: T, context: any) => {
    const timer = new ExecutionTimer();

    // Start overall processor timing
    timer.start(`${processorName}.overall`);

    try {
      const result = await processor(payload, context);

      // End overall timing
      timer.end();

      // Return result with timing data
      return {
        result,
        executionTimings: timer.getTimings(),
        totalExecutionTime: timer.getTotalExecutionTime(),
        methodBreakdown: timer.getMethodBreakdown(),
      };
    } catch (error) {
      timer.end();
      throw error;
    }
  };
}
