import {operationsRequest} from './operations-control';
export type DockRow={id:string;queueNumber:number|null;position?:number;houseNumber:string;houseNumbers?:string[];vehiclePlate:string;dockId:string|null;calledAt?:string;estimatedWaitMinutes?:number};
export type DockBoard={scope:'live'|'sit';updatedAt:string;refreshSeconds:number;called:DockRow[];queue:DockRow[];bays:{id:string;name:string;type:string;status:string;houseNumber:string|null;houseNumbers?:string[]}[]};
export const readDockDisplay=(scope:'live'|'sit')=>operationsRequest<DockBoard>(`/api/dock/display?scope=${scope}`);
