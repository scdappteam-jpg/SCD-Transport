export {};

declare global {
  interface Job {
    id: string;
    houseNumber: string;
    customerId?: string;
    customerName?: string;
    flightNo?: string;
    flightTime?: string;
    flightTimeLabel?: string;
    pickupDate?: string;
    status: string;
    driverId?: string;
    driverName?: string;
    vehiclePlate?: string;
    routeType?: string;
    destination?: string;
    terminalDestination?: string;
    locationId?: string;
    productType?: string;
    xrayStatus?: string;
    readyForBilling?: boolean;
    amount?: number;
    redFlag?: boolean;
    hoursToFlight?: number | null;
    updatedAt?: string;
    createdAt?: string;
  }

  interface BillingRecord {
    id: string;
    invoiceNo?: string;
    houseNumber?: string;
    customerName?: string;
    amount?: number;
    status?: string;
    createdAt?: string;
  }

  interface AlertRecord {
    id: string;
    message: string;
    severity?: string;
    createdAt?: string;
    dismissed?: boolean;
  }
}
