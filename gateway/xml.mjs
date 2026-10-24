// Small XML reader for bounded device metadata. No DTD, external entities or URLs.
export function parseDeviceXml(input){
 if(typeof input!=='string'||Buffer.byteLength(input)>65536||/<!DOCTYPE|<!ENTITY/i.test(input))throw Error('DEVICE_XML_INVALID');
 const document={name:'#document',children:[],text:''},stack=[document];let offset=0,nodes=0;
 const decode=s=>s.replace(/&([^;]+);/g,(_,e)=>{const fixed={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};if(e in fixed)return fixed[e];if(!/^#(?:[0-9]+|x[0-9a-f]+)$/i.test(e))throw Error('DEVICE_XML_ENTITY');const n=e[1]?.toLowerCase()==='x'?parseInt(e.slice(2),16):Number(e.slice(1));if(!Number.isSafeInteger(n)||n<32&&!['9','10','13'].includes(String(n))||n>0x10ffff||n>=0xd800&&n<=0xdfff)throw Error('DEVICE_XML_ENTITY');return String.fromCodePoint(n)});
 const token=/<!--[^]*?-->|<\?[^]*?\?>|<!\[CDATA\[[^]*?\]\]>|<[^>]+>|[^<]+/g;
 for(const m of input.matchAll(token)){
  if(m.index!==offset)throw Error('DEVICE_XML_INVALID');offset+=m[0].length;const t=m[0],parent=stack.at(-1);
  if(t.startsWith('<!--')||t.startsWith('<?'))continue;
  if(t.startsWith('<![CDATA[')){parent.text+=t.slice(9,-3);continue;}
  if(t.startsWith('</')){const name=t.match(/^<\/([\w:.-]+)\s*>$/)?.[1];if(stack.length<2||stack.at(-1).qualified!==name)throw Error('DEVICE_XML_INVALID');stack.pop();continue;}
  if(t.startsWith('<')){const m=t.match(/^<([A-Za-z_][\w:.-]*)(?:\s+[^<>]*)?\s*\/?>$/);if(!m||t.startsWith('<!')||++nodes>2048||stack.length>20)throw Error('DEVICE_XML_INVALID');const n={name:m[1].split(':').at(-1),qualified:m[1],children:[],text:''};parent.children.push(n);if(!t.endsWith('/>'))stack.push(n);continue;}
  parent.text+=decode(t);
 }
 if(offset!==input.length||stack.length!==1||document.children.length!==1||document.text.trim())throw Error('DEVICE_XML_INVALID');return document.children[0];
}
export function xmlChild(node,name){const found=node.children.filter(c=>c.name===name);if(found.length>1)throw Error('DEVICE_XML_DUPLICATE');return found[0]}
export function xmlValue(node,name){const n=xmlChild(node,name);if(!n)return undefined;if(n.children.length)throw Error('DEVICE_XML_VALUE');return n.text.trim()}
