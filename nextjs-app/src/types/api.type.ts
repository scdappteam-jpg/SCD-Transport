export {};

declare global {
  interface ScanResponse {
    success: boolean;
    count: number;
    barcodes: string[];
    error?: string;
  }

  interface ScanDisplayResult {
    success: boolean;
    count: number;
    codes: string[];
    rawJson: string;
  }

  interface ApiErrorResponse {
    error: string;
  }
}
