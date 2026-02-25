// NEW PROXY ANIMATION
// Runtime patch: allow NewSplatAccumulator to run cov-only generators (covSplats=true)
// without requiring a parallel gsplat generator.
export function applySparkCovOnlyPatch(sparkModule) {
  try {
    if (!sparkModule || typeof sparkModule !== 'object') return { applied: false, reason: 'missing spark module' };
    const Acc = sparkModule.NewSplatAccumulator;
    const dyno = sparkModule.dyno;
    const original = Acc?.prototype?.prepareProgramMaterial;
    if (Acc?.prototype?.__sparkCovOnlyPatchApplied) return { applied: true };
    if (typeof original !== 'function' || !dyno) return { applied: false, reason: 'missing accumulator method or dyno exports' };

    const {
      dynoBlock, dynoConst, splitCovSplat, combineCovSplat, outputCovSplat, outputCovSplatDepth, outputExtCovSplat, sub, mul, DynoProgram
    } = dyno;
    if (!dynoBlock || !DynoProgram || !outputCovSplat || !outputCovSplatDepth) return { applied: false, reason: 'missing dyno symbols' };

    function prepareCovOnlyProgram(acc, covGenerator) {
      const key = covGenerator;
      let program = Acc.generatorProgram.get(key);
      if (!program) {
        const graph = dynoBlock({ index: 'int' }, {}, ({ index }, _outputs, { roots }) => {
          covGenerator.inputs.index = index;
          if (acc.extSplats) {
            roots.push(outputExtCovSplat(covGenerator.outputs.covsplat));
          } else {
            const covsplat = covGenerator.outputs.covsplat;
            const centerSubView = sub(splitCovSplat(covsplat).outputs.center, Acc.viewCenterUniform);
            const halfAlpha = mul(splitCovSplat(covsplat).outputs.opacity, dynoConst('float', 0.5));
            const packed = combineCovSplat({ covsplat, center: centerSubView, opacity: halfAlpha });
            roots.push(outputCovSplat(packed, dynoConst('vec4', [0, 1, sparkModule.LN_SCALE_MIN, sparkModule.LN_SCALE_MAX])));
          }
          roots.push(outputCovSplatDepth(covGenerator.outputs.covsplat, Acc.viewCenterUniform, Acc.viewDirUniform, Acc.sortRadialUniform));
        });
        program = new DynoProgram({
          graph,
          inputs: { index: 'index' },
          outputs: {},
          template: acc.extSplats ? Acc.programExtTemplate : Acc.programTemplate
        });
        Acc.generatorProgram.set(key, program);
      }
      Object.assign(program.uniforms, { targetLayer: { value: 0 }, targetBase: { value: 0 }, targetCount: { value: 0 } });
      const material = program.prepareMaterial();
      Acc.fullScreenQuad.material = material;
      return { program, material };
    }

    Acc.prototype.prepareProgramMaterial = function patchedPrepareProgramMaterial(generator, covGenerator) {
      if (!generator && covGenerator && this.covSplats === true) return prepareCovOnlyProgram(this, covGenerator);
      return original.call(this, generator, covGenerator);
    };

    Acc.prototype.__sparkCovOnlyPatchApplied = true;
    return { applied: true };
  } catch (error) {
    return { applied: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
