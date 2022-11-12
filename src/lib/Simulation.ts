export const enum SimType {
	DoublePendulums,
	LongPendulum,
	BoundedObjects
}

type Vec2 = [number, number];

const Vec2 = {
	add: (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]],
	sub: (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]],
	scale: (a: Vec2, s: number): Vec2 => [a[0] * s, a[1] * s],
	length: (a: Vec2): number => Math.hypot(a[0], a[1]),
	equal: (a: Vec2, b: Vec2) => a[0] === b[0] && a[1] === b[1]
};

class SimObject {
	readonly frozen: boolean = false;
	oldPosition: Vec2;
	accleration: Vec2;

	constructor(
		public position: Vec2,
		public radius = 10,
		public mass = radius * radius
	) {
		this.oldPosition = position;
		this.accleration = [0, 0];
	}

	updatePosition(dt: number) {
		const velocity = Vec2.sub(this.position, this.oldPosition);

		// Save current position as old position
		this.oldPosition = this.position;

		// Perform Verlet integration
		this.position = Vec2.add(
			Vec2.add(this.position, velocity),
			Vec2.scale(this.accleration, dt * dt)
		);

		// Reset acceleration
		this.accleration = [0, 0];
	}

	accelerate(accleration: Vec2) {
		this.accleration = Vec2.add(this.accleration, accleration);
	}

	draw(ctx: CanvasRenderingContext2D) {
		ctx.fillStyle = 'white';
		ctx.beginPath();
		ctx.arc(this.position[0], this.position[1], this.radius, 0, 2 * Math.PI);
		ctx.fill();
	}
}

class FrozenSimObject extends SimObject {
	readonly frozen = true;
	originalPosition: Vec2;

	constructor(...args: ConstructorParameters<typeof SimObject>) {
		super(...args);

		this.originalPosition = this.position;
	}

	updatePosition() {
		this.position = this.originalPosition;
		this.oldPosition = this.originalPosition;
	}

	draw(ctx: CanvasRenderingContext2D) {
		ctx.fillStyle = 'gray';
		ctx.beginPath();
		ctx.arc(this.position[0], this.position[1], this.radius, 0, 2 * Math.PI);
		ctx.fill();
	}
}

class Link {
	constructor(
		public a: SimObject,
		public b: SimObject,
		public target: number
	) {}

	apply() {
		const axis = Vec2.sub(this.b.position, this.a.position);
		const dist = Vec2.length(axis);

		const normal = Vec2.scale(axis, 1 / dist);
		const delta = Vec2.scale(normal, dist - this.target);

		if (this.a.frozen) {
			this.b.position = Vec2.sub(this.b.position, delta);
		} else if (this.b.frozen) {
			this.a.position = Vec2.add(this.a.position, delta);
		} else {
			const deltaA = Vec2.scale(
				delta,
				this.a.mass / (this.a.mass + this.b.mass)
			);
			const deltaB = Vec2.sub(delta, deltaA);

			this.a.position = Vec2.add(this.a.position, deltaB);
			this.b.position = Vec2.sub(this.b.position, deltaA);
		}
	}

	draw(ctx: CanvasRenderingContext2D) {
		ctx.strokeStyle = 'limegreen';
		ctx.beginPath();
		ctx.moveTo(this.a.position[0], this.a.position[1]);
		ctx.lineTo(this.b.position[0], this.b.position[1]);
		ctx.stroke();
	}
}

export class Simulation {
	canvas!: HTMLCanvasElement;
	ctx!: CanvasRenderingContext2D;
	playing = false;
	private id?: number;
	private t?: number;

	bounded = false;
	collisions = false;
	objects: SimObject[] = [];
	links: Link[] = [];
	gravity: Vec2 = [0, 1000];

	constructor(public simType: SimType) {
		if (simType === SimType.DoublePendulums) {
			this.objects.push(new FrozenSimObject([300, 200], 5));

			// Create a bunch of double pendulums attached to the first object
			const count = 10;
			const diff = Math.PI / 10000 / count;

			for (let i = 0; i < count; i++) {
				const x1 = 300 + 100 * Math.cos((i * diff + 7 / 5) * Math.PI);
				const y1 = 200 + 100 * Math.sin((i * diff + 7 / 5) * Math.PI);
				const obj = new SimObject([x1, y1], 5);
				this.objects.push(obj);

				const x2 = x1 + 100 * Math.cos((i * diff + 7 / 5) * Math.PI);
				const y2 = y1 + 100 * Math.sin((i * diff + 7 / 5) * Math.PI);
				const obj2 = new SimObject([x2, y2], 5);
				this.objects.push(obj2);

				this.links.push(new Link(this.objects[0], obj, 100));
				this.links.push(new Link(obj, obj2, 100));
			}
		} else if (simType === SimType.LongPendulum) {
			this.objects.push(new FrozenSimObject([300, 200], 5));

			// Create a chain of objects
			const count = 10;
			const diff = 0;

			const len = 50;

			for (let i = 1; i < count; i++) {
				const [px, py] = this.objects.at(-1)!.position;
				const x = px + len * Math.cos((i * diff + 6 / 5) * Math.PI);
				const y = py + len * Math.sin((i * diff + 6 / 5) * Math.PI);
				const obj = new SimObject([x, y], 5);
				this.objects.push(obj);

				this.links.push(new Link(this.objects.at(-2)!, obj, len));
			}

			// this.collisions = true;

			this.objects.at(-1)!.mass = 10000;
		} else if (simType === SimType.BoundedObjects) {
			this.bounded = true;
			this.collisions = true;
		}
	}

	start(canvas?: HTMLCanvasElement) {
		if (canvas) {
			this.canvas = canvas;
			this.ctx = canvas.getContext('2d')!;
		}

		this.playing = true;
		this.step(0);
	}

	stop() {
		this.playing = false;

		if (this.id !== undefined) {
			cancelAnimationFrame(this.id);
		}
	}

	private step(t: number) {
		const dt = (t - (this.t || t)) / 1000;
		this.t = t;

		// Advance simulation with substeps
		const substeps = 1000;

		// Cap dt to 1/50th of a second
		const subDt = Math.min(dt, 1 / 50) / substeps;

		for (let i = 0; i < substeps; i++) {
			this.update(subDt);
		}

		// Draw
		this.draw();

		// Show FPS
		const fps = (1 / dt).toFixed(1);
		this.ctx.fillStyle = 'white';
		this.ctx.font = '20px monospace';
		this.ctx.fillText(`${fps} FPS`, 10, 30);

		// Schedule next frame
		if (this.playing) {
			this.id = requestAnimationFrame(dt => this.step(dt));
		}

		if (this.simType === SimType.BoundedObjects) {
			// Add a new object 2 times per second, up to 100
			if (t % 500 < dt * 1000 && this.objects.length < 100) {
				this.objects.push(new SimObject([350, 100], Math.random() * 20 + 10));
			}
		}
	}

	private update(dt: number) {
		this.applyGravity();
		if (this.bounded) this.applyConstraint();
		if (this.collisions) this.solveCollisions();
		this.applyLinks();
		this.updatePositions(dt);
	}

	private applyGravity() {
		for (const obj of this.objects) {
			obj.accelerate(this.gravity);
		}
	}

	private applyConstraint() {
		const position: Vec2 = [this.canvas.width / 2, this.canvas.height / 2];
		const radius = 250;

		for (const obj of this.objects) {
			const distance = Vec2.length(Vec2.sub(obj.position, position));

			if (distance > radius - obj.radius) {
				const direction = Vec2.sub(obj.position, position);
				const normal = Vec2.scale(direction, 1 / distance);

				obj.position = Vec2.add(
					position,
					Vec2.scale(normal, radius - obj.radius)
				);
			}
		}
	}

	private solveCollisions() {
		for (let i = 0; i < this.objects.length; i++) {
			const a = this.objects[i];

			for (let j = i + 1; j < this.objects.length; j++) {
				const b = this.objects[j];

				const axis = Vec2.sub(a.position, b.position);
				const distance = Vec2.length(axis);

				if (distance === 0) continue;

				const minDistance = a.radius + b.radius;

				if (distance < minDistance) {
					const normal = Vec2.scale(axis, 1 / distance);
					const delta = Vec2.scale(normal, minDistance - distance);

					if (a.frozen) {
						b.position = Vec2.sub(b.position, delta);
					} else if (b.frozen) {
						a.position = Vec2.add(a.position, delta);
					} else {
						const deltaA = Vec2.scale(delta, a.mass / (a.mass + b.mass));
						const deltaB = Vec2.sub(delta, deltaA);

						a.position = Vec2.add(a.position, deltaB);
						b.position = Vec2.sub(b.position, deltaA);
					}
				}
			}
		}
	}

	private applyLinks() {
		for (const link of this.links) {
			link.apply();
		}
	}

	private updatePositions(dt: number) {
		for (const obj of this.objects) {
			obj.updatePosition(dt);
		}
	}

	private draw() {
		// Clear canvas
		this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

		// Draw constraint
		if (this.bounded) {
			this.ctx.strokeStyle = 'white';
			this.ctx.beginPath();
			this.ctx.arc(
				this.canvas.width / 2,
				this.canvas.height / 2,
				250,
				0,
				2 * Math.PI
			);
			this.ctx.stroke();
		}

		// Draw objects
		for (const obj of this.objects) {
			obj.draw(this.ctx);
		}

		// Draw links
		for (const link of this.links) {
			link.draw(this.ctx);
		}
	}
}
