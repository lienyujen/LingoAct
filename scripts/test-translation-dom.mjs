import assert from 'node:assert/strict'
import {test} from 'node:test'
import {guardTranslationDom} from '../src/lib/translationDomGuard.ts'

test('translator replacements restore the original live nodes; React removals remain removed',()=>{
 const previousNode=globalThis.Node,previousObserver=globalThis.MutationObserver
 let notify, disconnected=false
 globalThis.Node={ELEMENT_NODE:1,TEXT_NODE:3}
 globalThis.MutationObserver=class{constructor(callback){notify=callback}observe(){}disconnect(){disconnected=true}}
 const root={children:[],classList:{add(){}},setAttribute(){},contains(node){return node===this||node.parentNode===this},insertBefore(node,before){if(node.parentNode)node.parentNode.removeChild(node);this.children.splice(this.children.indexOf(before),0,node);node.parentNode=this},removeChild(node){const i=this.children.indexOf(node);if(i<0)throw new Error('NotFoundError');this.children.splice(i,1);node.parentNode=null;return node}}
 const text=data=>({nodeType:3,nodeName:'#text',parentNode:null,data})
 const element=name=>({nodeType:1,nodeName:name,parentNode:root})
 try{
  const stop=guardTranslationDom(root)
  const first=text('請作答'),second=text('100'),button=element('BUTTON'),fontA=element('FONT'),fontB=element('FONT')
  root.children=[fontA,fontB,button]
  notify([
   {target:root,removedNodes:[first],addedNodes:[],nextSibling:second},
   {target:root,removedNodes:[],addedNodes:[fontA],nextSibling:second},
   {target:root,removedNodes:[second],addedNodes:[fontB],nextSibling:button},
  ])
  assert.deepEqual(root.children,[first,second,button])
  assert.equal(first.parentNode,root);assert.equal(second.parentNode,root)
  second.data='80';assert.equal(root.children[1].data,'80')
  root.removeChild(first)
  notify([{target:root,removedNodes:[first],addedNodes:[],nextSibling:second}])
  assert.deepEqual(root.children,[second,button])
  // A legitimate span added by React is not a translation replacement.
  const span=element('SPAN');root.removeChild(second);root.children.unshift(span)
  notify([{target:root,removedNodes:[second],addedNodes:[span],nextSibling:button}])
  assert.equal(second.parentNode,null)
  stop();assert.equal(disconnected,true)
 }finally{globalThis.Node=previousNode;globalThis.MutationObserver=previousObserver}
})
