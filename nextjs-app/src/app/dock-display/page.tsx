import {DockDisplay} from '@/components/dock-display';
export default async function DockDisplayPage({searchParams}:{searchParams:Promise<{scope?:string}>}){
 const query=await searchParams;
 return <DockDisplay scope={query.scope==='sit'?'sit':'live'}/>;
}
