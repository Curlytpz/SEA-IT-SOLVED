function distance(left=[],right=[]){const a=Array.from(left),b=Array.from(right),row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i+=1){let previous=row[0];row[0]=i;for(let j=1;j<=b.length;j+=1){const saved=row[j];row[j]=Math.min(row[j]+1,row[j-1]+1,previous+(a[i-1]===b[j-1]?0:1));previous=saved;}}return row[b.length];}
function errorRate(reference,prediction,tokenize){const expected=tokenize(reference),actual=tokenize(prediction);return expected.length?distance(expected,actual)/expected.length:(actual.length?1:0);}
const chars=value=>Array.from(String(value||''));
const words=value=>String(value||'').trim().split(/\s+/).filter(Boolean);
function characterErrorRate(reference,prediction){return errorRate(reference,prediction,chars);}
function wordErrorRate(reference,prediction){return errorRate(reference,prediction,words);}
function equationExactMatch(references,predictions){const total=references.length;if(!total)return null;const correct=references.reduce((sum,value,index)=>sum+(String(value).trim()===String(predictions[index]||'').trim()?1:0),0);return{correct,total,percentage:correct/total*100};}
function normalizedEditSimilarity(reference,prediction){const a=chars(reference),b=chars(prediction),size=Math.max(a.length,b.length);return size?(1-distance(a,b)/size)*100:100;}
function timestampMeanAbsoluteError(reference,prediction){if(!reference.length||reference.length!==prediction.length)return null;return reference.reduce((sum,value,index)=>sum+Math.abs(Number(value)-Number(prediction[index])),0)/reference.length;}
module.exports={distance,characterErrorRate,wordErrorRate,equationExactMatch,normalizedEditSimilarity,timestampMeanAbsoluteError};
