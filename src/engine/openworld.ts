import * as THREE from 'three'
import type { TierId, UnitKind } from '../game/balance'
import { Colliders } from './collide'
import { glowTexture } from './fx'
import { COLOR } from './palette'
import { makeTearMaterial } from './world'

/**
 * The open city around the Rifts: roads every 80 m, about two hundred buildings drawn as one
