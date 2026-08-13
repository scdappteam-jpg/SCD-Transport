export {};

declare global {
  interface User {
    id: string;
    name: string;
    role: string;
    status: string;
    vehiclePlate?: string;
  }

  interface Customer {
    id: string;
    name: string;
    taxId?: string;
    billingEmail?: string;
    creditTerm?: number;
  }
}
