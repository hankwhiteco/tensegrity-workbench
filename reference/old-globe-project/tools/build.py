"""Inject solved shells from data/f*.json into src/template.html -> dist/tensegrity.html"""
import json,glob,os
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
data={}
for i,f in enumerate(sorted(glob.glob(root+'/data/f*.json'))):
    d=json.load(open(f))
    data[i+1]={'P':[[round(x,3) for x in p] for p in d['P']],'S':d['struts'],'C':d['cables']}
t=open(root+'/src/template.html').read().replace('__DATA__',json.dumps(data,separators=(',',':')))
open(root+'/dist/tensegrity.html','w').write(t)
print('built',len(t),'bytes,',len(data),'levels')
