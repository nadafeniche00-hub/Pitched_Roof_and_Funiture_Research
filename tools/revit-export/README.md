# Revit furniture to IFC

A small Revit 2025 add-in (`ExportFurniture`) that turns furniture families into IFC4 files the app's viewer can load.
For each family it opens a scratch project, loads the family, places its first type at the origin, exports IFC and notes
the bounding box (metres) in `report.json`. Your own Revit projects are not touched.

Status: compiles against this machine's Revit 2025 (build 25.5, .NET 10). **Not run yet**: this machine has no bed,
wardrobe, sofa or chair families (only Sportify's), and Revit's default furniture content is not installed.

## Steps

1. Install Autodesk's Revit 2025 furniture content (your Autodesk account, Downloads, the Revit content library; or in
   Revit: Insert, Load Autodesk Family). Note where the `.rfa` files land.
2. Build: `dotnet build -c Release` in this folder.
3. Copy `UsableSpace.addin.template` to `%APPDATA%\Autodesk\Revit\Addins\2025\UsableSpace.addin`, replace `__DLL__` with the
   full path of `bin\Release\net10.0-windows\RevitIfcExport.dll`.
4. Copy `families.txt.example` to `bin\Release\net10.0-windows\families.txt` and fill in the paths.
5. Start Revit, open any project, Add-Ins, External Tools, **Usable Space IFC export**, "Load Once".
6. The IFC files and `report.json` appear in the `out` folder.

Wall-hosted or face-hosted families cannot be placed at the origin; they are reported as errors in `report.json`.
