import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import zlib from 'node:zlib';
import vm from 'node:vm';
const require=createRequire(import.meta.url),xlsxXml=require('../src/server/xlsx-xml.cjs');
const source=readFileSync(new URL('../src/server/legacy-api.cjs',import.meta.url),'utf8');
function zip(name:string,text:string){
 const filename=Buffer.from(name),data=Buffer.from(text);let crc=0xffffffff;
 for(const byte of data){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}crc=(crc^0xffffffff)>>>0;
 const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt32LE(crc,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(filename.length,26);
 const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt32LE(crc,16);central.writeUInt32LE(data.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(filename.length,28);
 const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(central.length+filename.length,12);end.writeUInt32LE(local.length+filename.length+data.length,16);
 return Buffer.concat([local,filename,data,central,filename,end]);
}
function parse(xml:string){const ctx=vm.createContext({Buffer,zlib,xlsxXml});for(const name of ['unescapeXml','parseXlsxRows','detectXlsxKind'])vm.runInContext(source.match(new RegExp('^function '+name+'\\([\\s\\S]*?^}','m'))![0],ctx);ctx.file=zip('xl/worksheets/sheet1.xml',xml);return {rows:vm.runInContext('parseXlsxRows(file)',ctx),ctx};}
test('valid prefixed and default SpreadsheetML both identify Consol headers and preserve numeric Houses and units',()=>{
 for(const prefix of ['','x:']){
  const xml=`<${prefix}worksheet ${prefix?'xmlns:x':'xmlns'}="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><${prefix}sheetData><${prefix}row r="1"><${prefix}c r="A1" t="str"><${prefix}v>MAWB</${prefix}v></${prefix}c><${prefix}c r="B1" t="str"><${prefix}v>DEST</${prefix}v></${prefix}c><${prefix}c r="C1" t="str"><${prefix}v>GRS WGT</${prefix}v></${prefix}c></${prefix}row><${prefix}row r="2"><${prefix}c r="A2"><${prefix}v>4840812447</${prefix}v></${prefix}c><${prefix}c r="B2" t="inlineStr"><${prefix}is><${prefix}t>PLT &amp; CTN</${prefix}t></${prefix}is></${prefix}c></${prefix}row></${prefix}sheetData></${prefix}worksheet>`;
  const {rows,ctx}=parse(xml);assert.deepEqual(Array.from(rows[0]),['MAWB','DEST','GRS WGT']);assert.equal(rows[1][0],4840812447);assert.equal(rows[1][1],'PLT & CTN');ctx.rows=rows;assert.equal(vm.runInContext('detectXlsxKind(rows)',ctx),'consol');
 }
});
test('unrelated XML prefixes remain unchanged rather than being treated as spreadsheet data',()=>{
 const xml='<x:worksheet xmlns:x="https://unrelated.example/schema"><x:row/></x:worksheet>';assert.equal(xlsxXml.normalize(xml),xml);
});
