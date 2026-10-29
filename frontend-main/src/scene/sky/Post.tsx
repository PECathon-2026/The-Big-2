/**
 * Postprocessing per quality tier (§8.2, §10.6):
 *  high   — mipmap-blur bloom (stars, Moon, Sun), SMAA, vignette, fine noise
 *  medium — bloom at half resolution, vignette
 *  low    — none (plain render)
 * Field mode (red night vision) turns bloom off.
 */
import { Bloom, EffectComposer, Noise, SMAA, Vignette } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import { useTier } from '@/scene/quality';
import { useApp } from '@/state/store';

export default function Post() {
  const t = useTier();
  const field = useApp((s) => s.field);
  if (t.bloom === 'off' || field) return null;
  const full = t.bloom === 'full';
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <Bloom mipmapBlur={full} intensity={full ? 0.85 : 0.6} luminanceThreshold={0.55} luminanceSmoothing={0.35} radius={0.7} resolutionScale={full ? 1 : 0.5} />
      {full ? <SMAA /> : <></>}
      <Vignette offset={0.28} darkness={0.55} />
      {full ? <Noise opacity={0.025} blendFunction={BlendFunction.OVERLAY} /> : <></>}
    </EffectComposer>
  );
}
