// Debug utility pre development
export const DEBUG = process.env.NODE_ENV === 'development';

export function debugLog(context: string, data: any) {
  if (DEBUG) {
    console.group(`🐛 DEBUG: ${context}`);
    console.log(data);
    console.groupEnd();
  }
}

export function debugError(context: string, error: any) {
  if (DEBUG) {
    console.group(`❌ ERROR: ${context}`);
    console.error(error);
    if (error?.stack) {
      console.trace(error.stack);
    }
    console.groupEnd();
  }
}

export function debugAPI(method: string, url: string, data?: any, response?: any) {
  if (DEBUG) {
    console.group(`🌐 API ${method}: ${url}`);
    if (data) {
      console.log('Request data:', data);
    }
    if (response) {
      console.log('Response:', response);
    }
    console.groupEnd();
  }
}

// Suppress React DevTools warning and error #130
if (typeof window !== 'undefined' && DEBUG) {
  // Override console methods to filter out React errors we want to ignore
  const originalError = console.error;
  console.error = (...args) => {
    const message = args[0]?.toString() || '';
    
    // Ignore React DevTools warning
    if (message.includes('Download the React DevTools')) {
      return;
    }
    
    // Ignore React error #130 (known issue)
    if (message.includes('Minified React error #130') || 
        message.includes('Error: Minified React error #130')) {
      return;
    }
    
    // Allow other errors
    originalError.apply(console, args);
  };
}
