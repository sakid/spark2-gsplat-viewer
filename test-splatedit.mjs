import * as THREE from 'three';
import * as spark from '@sparkjsdev/spark';

const edit = new spark.SplatEdit();
console.log('SplatEdit methods:', Object.getOwnPropertyNames(spark.SplatEdit.prototype));

const sdf = new spark.SplatEditSdf({ type: 'box', opacity: 0 });
console.log('Sdf:', sdf);

edit.addSdf(sdf);
console.log('Edit children:', edit.children.length);
