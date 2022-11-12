<script lang="ts">
	import { SimType, Simulation } from '$lib/Simulation';
	import { onMount } from 'svelte';

	let canvas: HTMLCanvasElement;
	let simulation = new Simulation(SimType.LongPendulum);

	onMount(() => {
		simulation.start(canvas);

		return () => simulation.stop();
	});
</script>

<div class="min-h-screen bg-black text-white font-mono grid place-items-center">
	<div class="flex flex-col gap-2">
		<canvas
			bind:this={canvas}
			width={600}
			height={600}
			class="bg-black border-2 border-white"
		/>

		<div class="flex flex-col gap-1">
			<label>
				<input
					type="checkbox"
					name="bounded"
					id="bounded"
					checked={simulation.bounded}
					on:input={() => {
						simulation.bounded = !simulation.bounded;
					}}
				/>
				Bounded
			</label>

			<label>
				<input
					type="checkbox"
					name="bounded"
					id="bounded"
					checked={simulation.collisions}
					on:input={() => {
						simulation.collisions = !simulation.collisions;
					}}
				/>
				Collisions
			</label>
		</div>
	</div>
</div>
