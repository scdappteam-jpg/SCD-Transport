import { OperationsControl } from '@/components/operations-control';
import {redirect} from 'next/navigation';
export default async function OperationsControlPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
    const params=await searchParams;
    const filters:Record<string,string>={};
    for(const key of ['query','from','to','dateBasis','period']) if(typeof params[key]==='string') filters[key]=params[key];
    if(params.embedded!=='1'){
        const query=new URLSearchParams({view:'operations-control',...filters});
        redirect('/legacy/index.html?'+query);
    }
    return <OperationsControl embedded initialFilters={filters}/>;
}
