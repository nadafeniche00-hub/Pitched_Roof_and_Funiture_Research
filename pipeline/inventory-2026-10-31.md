# Server inventory, 31 Oct 2026

Run in the Real2Twin lab (`nada-r2t-lab`) with `pipeline/notebooks/00_inventory.ipynb`; result file `/workspace/usable-space/out/inventory.json`.

| Item | Result |
|---|---|
| Machine | aarch64, Python 3.12.3, GPU NVIDIA GB10 (memory fields report N/A: shared with the CPU) |
| Memory | 121 GiB total, 87 GiB used, 2.7 GiB free, 33 GiB buffer/cache, **33 GiB available** |
| Disk `/workspace` | 916 GB, 236 GB used, 633 GB free |
| Installed | torch 2.9.0a0 (NVIDIA build), transformers 5.21.1, opencv 5.0.0, scikit-image 0.26.0, trimesh 5.2.0, pandas 3.1.0, pyarrow 26.0.0, duckdb 2.0.0, ifcopenshell 0.9.0, dvc 3.67.1, shapely 2.2.0, networkx 3.5, scikit-learn 1.7.1, requests |
| Model classes available | SamModel, Sam2Model, GroundingDinoForObjectDetection, depth estimation, semantic segmentation, Qwen2.5-VL, image-text-to-text |
| Models already cached | grounding-dino-tiny, Depth-Anything-V2-Small, sam2.1-hiera-tiny |
| **Missing** | geopandas, pyproj, rasterio, fiona, momepy, osmnx, xgboost, rdflib, SPARQLWrapper, segment_anything, groundingdino (repo packages), ultralytics, timm, diffusers, airflow |

Consequences
- SAM 2.1 and Grounding DINO work through transformers today: plan reading does not need extra packages.
- GeoPandas is not installed (it was assumed to be): `pip install geopandas pyproj` before the site and LoD2 steps.
- Only 33 GiB of memory is available because the team LLM holds a large share: the texture notebook (about 8 GB for the model) fits but must be run when nobody else needs the GPU, and its free-memory check should compare against available memory.
- The vllm endpoint was not queried: ask which model is served and whether it accepts images.
