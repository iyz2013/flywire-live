# Project resources

Start with the Google MaleCNS article, then the Janelia dataset and Xenova implementation. Google’s work helped reconstruct biological wiring; flywire.live adds its own market-to-stimulus mapping and expressive animation.

## Google research and tools

- [Mapping the complete male fruit fly brain](https://research.google/blog/a-connectomics-milestone-mapping-the-complete-male-fruit-fly-brain/): the most directly relevant overview of Google and HHMI Janelia’s MaleCNS collaboration.
- [MaleCNS research paper on Google Research](https://research.google/pubs/sexual-dimorphism-in-the-complete-connectome-of-the-drosophila-male-central-nervous-system/): scientific publication describing the complete male central nervous system connectome and sex differences.
- [Automated 3D reconstruction of a fly brain](https://research.google/blog/an-interactive-automated-3d-reconstruction-of-a-fly-brain/): background on reconstructing neurons from microscopy using flood-filling networks.
- [Google’s flood-filling network code](https://github.com/google/ffn): research implementation for segmenting complex shapes in 3D microscopy volumes.
- [Google’s Neuroglancer repository](https://github.com/google/neuroglancer): browser-based viewing of volumetric data, neuron meshes and skeletons. This is a related research tool; our website uses Three.js.
- [The Drosophila hemibrain release](https://research.google/blog/releasing-the-drosophila-hemibrain-connectome-the-largest-synapse-resolution-map-of-brain-connectivity/): earlier Google/Janelia work on fly-brain connectivity.

## Sources used by this project

- [HHMI Janelia MaleCNS](https://male-cns.janelia.org/) and [dataset downloads](https://male-cns.janelia.org/download/): anatomy, annotations and measured connectivity.
- [Xenova fruit-fly-simulation](https://huggingface.co/spaces/Xenova/fruit-fly-simulation/tree/main): the upstream browser model implementation and fly assets.
- [Shiu and colleagues’ neural model](https://github.com/philshiu/Drosophila_brain_model) and [Nature paper](https://www.nature.com/articles/s41586-024-07763-9): reference leaky integrate-and-fire model.
- [NeuroMechFly body assets](https://github.com/NeLy-EPFL/fly-svg-maker/tree/152506d3471646f009480c81f34aefbaec29a6e5): fly meshes and kinematics.

The [README source list](../README.md#sources-and-credits) also covers Robinhood Chain, PublicNode, DEX Screener, Uniswap, Pons, rendering libraries, fonts and licenses.
