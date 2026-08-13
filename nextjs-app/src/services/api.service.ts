import axios from "axios";

export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL || "",
  timeout: 30000,
  headers: { "Content-Type": "application/json" }
});

export async function getBootstrap(): Promise<BootstrapResponse> {
  const response = await apiClient.get<BootstrapResponse>("/api/bootstrap");
  return response.data;
}

export async function scanBarcode(image: Blob): Promise<ScanResponse> {
  const response = await apiClient.post<ScanResponse>("/api/scan-barcode", image, {
    headers: { "Content-Type": image.type || "image/jpeg" },
    timeout: 70000
  });
  return response.data;
}

export function toScanDisplayResult(response: ScanResponse): ScanDisplayResult {
  return {
    success: response.success,
    count: response.count,
    codes: response.barcodes,
    rawJson: JSON.stringify(response, null, 2)
  };
}

export async function runWorkflow<TPayload extends object, TResult = Record<string, unknown>>(
  path: string,
  payload: TPayload
): Promise<TResult> {
  const response = await apiClient.post<TResult>(path, payload);
  return response.data;
}
