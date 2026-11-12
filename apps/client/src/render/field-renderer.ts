import * as THREE from 'three';
import type {
  GamePack,
  ObstacleShape,
  PieceSnapshot,
  RobotSnapshot,
  SimSnapshot,
} from '@frcsandbox/sim';

/**
 * Builds the static 3D field once, then updates instanced game pieces and
 * robot meshes each frame from simulation snapshots. Game pieces use a single
 * InstancedMesh so hundreds of them stay cheap on weak devices.
 */

const ALLIANCE_COLOR: Record<string, number> = { red: 0xdc2626, blue: 0x2563eb };
const PIECE_COLOR = 0xfacc15;
const STRUCTURE_COLOR = 0x9ca3af;
const RAMP_COLOR = 0xb45309;
const CARPET_COLOR = 0x20242c;

export class FieldRenderer {
  readonly scene = new THREE.Scene();
  private readonly pieceMesh: THREE.InstancedMesh;
  private readonly robotMeshes = new Map<string, THREE.Group>();
  private readonly dummy = new THREE.Object3D();
  private readonly pieceRadius: number;
  private readonly maxPieces: number;

  constructor(private readonly pack: GamePack) {
    this.scene.background = new THREE.Color(0x0f1115);
    this.addLights();
    this.addCarpetAndWalls();
    this.addObstacles();
    this.addGoals();

    const piece = pack.pieceTypes[0]!;
    this.pieceRadius = piece.shape.kind === 'sphere' ? piece.shape.radius : piece.shape.size[0] / 2;
    this.maxPieces = this.countPieces();
    this.pieceMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(this.pieceRadius, 10, 8),
      new THREE.MeshLambertMaterial({ color: PIECE_COLOR }),
      Math.max(1, this.maxPieces),
    );
    this.pieceMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pieceMesh.frustumCulled = false;
    this.scene.add(this.pieceMesh);
  }

  private countPieces(): number {
    const spawns = this.pack.pieceSpawns.length;
    const areas = this.pack.pieceSpawnAreas.reduce((n, a) => n + a.count, 0);
    const preload = (this.pack.preload?.maxPerRobot ?? 0) * 6;
    return spawns + areas + preload;
  }

  private addLights(): void {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(this.pack.field.size[0] * 0.5, this.pack.field.size[1] * 0.5, 10);
    this.scene.add(sun);
  }

  private addCarpetAndWalls(): void {
    const [length, width] = this.pack.field.size;
    const carpet = new THREE.Mesh(
      new THREE.PlaneGeometry(length, width),
      new THREE.MeshLambertMaterial({ color: CARPET_COLOR }),
    );
    carpet.position.set(length / 2, width / 2, 0);
    this.scene.add(carpet);

    // Thin alliance-colored strips at each end to orient the viewer.
    const strip = (x: number, color: number) => {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(length * 0.06, width),
        new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.3 }),
      );
      mesh.position.set(x, width / 2, 0.01);
      this.scene.add(mesh);
    };
    strip(length * 0.03, ALLIANCE_COLOR.blue!);
    strip(length * 0.97, ALLIANCE_COLOR.red!);
  }

  private addObstacles(): void {
    for (const obstacle of this.pack.field.obstacles) {
      const mesh = this.obstacleMesh(obstacle.shape);
      this.scene.add(mesh);
    }
  }

  private obstacleMesh(shape: ObstacleShape): THREE.Mesh {
    const [cx, cy, cz] = shape.center;
    const [sx, sy, sz] = shape.size;
    if (shape.kind === 'box') {
      const top = cz + sz / 2;
      const color = top > 1 ? STRUCTURE_COLOR : 0x4b5563;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(sx, sy, sz),
        new THREE.MeshLambertMaterial({ color, transparent: top > 1.2, opacity: 0.6 }),
      );
      mesh.position.set(cx, cy, cz);
      return mesh;
    }
    // Ridge: triangular prism with the peak along ridgeAxis.
    const hx = sx / 2;
    const hy = sy / 2;
    const hz = sz / 2;
    const geometry = new THREE.BufferGeometry();
    const v =
      shape.ridgeAxis === 'y'
        ? [-hx, -hy, -hz, hx, -hy, -hz, 0, -hy, hz, -hx, hy, -hz, hx, hy, -hz, 0, hy, hz]
        : [-hx, -hy, -hz, -hx, hy, -hz, -hx, 0, hz, hx, -hy, -hz, hx, hy, -hz, hx, 0, hz];
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    geometry.setIndex([0, 1, 2, 3, 5, 4, 0, 2, 5, 0, 5, 3, 1, 4, 5, 1, 5, 2, 0, 3, 4, 0, 4, 1]);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color: RAMP_COLOR }));
    mesh.position.set(cx, cy, cz);
    return mesh;
  }

  private addGoals(): void {
    for (const goal of this.pack.field.goals) {
      const [sx, sy, sz] = goal.box.size;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(sx, sy, sz),
        new THREE.MeshLambertMaterial({
          color: ALLIANCE_COLOR[goal.creditAlliance] ?? 0xffffff,
          transparent: true,
          opacity: 0.35,
        }),
      );
      mesh.position.set(goal.box.center[0], goal.box.center[1], goal.box.center[2]);
      mesh.userData.goalId = goal.id;
      this.scene.add(mesh);
    }
  }

  private robotMesh(robot: RobotSnapshot): THREE.Group {
    const group = new THREE.Group();
    // Frame dimensions are not in the snapshot; use a default footprint plus a
    // direction wedge. The bot creator (Milestone 4) will supply real geometry.
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.7, 0.5),
      new THREE.MeshLambertMaterial({ color: ALLIANCE_COLOR[robot.alliance] ?? 0x888888 }),
    );
    body.position.z = 0.25;
    group.add(body);
    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.1, 0.2, 4),
      new THREE.MeshLambertMaterial({ color: 0xe5e7eb }),
    );
    nose.rotation.z = -Math.PI / 2;
    nose.position.set(0.4, 0, 0.45);
    group.add(nose);
    return group;
  }

  update(snapshot: SimSnapshot): void {
    this.updatePieces(snapshot.pieces);
    this.updateRobots(snapshot.robots);
    this.updateGoals(snapshot);
  }

  private updatePieces(pieces: PieceSnapshot[]): void {
    let count = 0;
    for (const piece of pieces) {
      if (piece.state !== 'field' || !piece.position || count >= this.maxPieces) continue;
      this.dummy.position.set(piece.position.x, piece.position.y, piece.position.z);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.pieceMesh.setMatrixAt(count, this.dummy.matrix);
      count += 1;
    }
    this.pieceMesh.count = count;
    this.pieceMesh.instanceMatrix.needsUpdate = true;
  }

  private updateRobots(robots: RobotSnapshot[]): void {
    for (const robot of robots) {
      let group = this.robotMeshes.get(robot.id);
      if (!group) {
        group = this.robotMesh(robot);
        this.robotMeshes.set(robot.id, group);
        this.scene.add(group);
      }
      group.position.set(robot.pose.x, robot.pose.y, robot.pose.z - 0.25);
      group.rotation.set(0, 0, robot.pose.yaw);
    }
  }

  private updateGoals(snapshot: SimSnapshot): void {
    const active = new Map(snapshot.goals.map((g) => [g.id, g.active]));
    this.scene.traverse((obj) => {
      const id = obj.userData.goalId as string | undefined;
      if (id && obj instanceof THREE.Mesh && !Array.isArray(obj.material)) {
        (obj.material as THREE.MeshLambertMaterial).opacity = active.get(id) ? 0.5 : 0.15;
      }
    });
  }

  dispose(): void {
    this.pieceMesh.geometry.dispose();
    (this.pieceMesh.material as THREE.Material).dispose();
  }
}
