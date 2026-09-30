import json,sys,matplotlib;matplotlib.use('Agg')
import matplotlib.pyplot as plt,numpy as np
d=json.load(open(sys.argv[1]));P=np.array(d['P'])
fig=plt.figure(figsize=(14,7),facecolor='black')
for k,(ry,rx) in enumerate([(0.5,0.3),(2.2,0.9)]):
    ax=fig.add_subplot(1,2,k+1,facecolor='black');ax.set_aspect('equal');ax.axis('off')
    cy,sy,cx,sx=np.cos(ry),np.sin(ry),np.cos(rx),np.sin(rx)
    x=P[:,0]*cy+P[:,2]*sy;z=-P[:,0]*sy+P[:,2]*cy;y=P[:,1]*cx-z*sx;z2=P[:,1]*sx+z*cx
    for a,b in d['cables']:ax.plot([x[a],x[b]],[y[a],y[b]],color='w',lw=0.4,alpha=0.35+0.4*(z2[a]+z2[b])/4)
    for a,b in d['struts']:ax.plot([x[a],x[b]],[y[a],y[b]],color='w',lw=2.2,alpha=0.5+0.5*(z2[a]+z2[b])/4,solid_capstyle='round')
plt.tight_layout();plt.savefig(sys.argv[2],dpi=70,facecolor='black')
