import { getSupabaseClient } from "./supabase.ts";
import { getOrCreateFolderPath } from "./drive_manager.ts";

/**
 * Resuelve y/o crea la Marca y la Categoría, devolviendo sus IDs.
 */
export async function resolveBrandAndCategory(brandName: string, categoryName: string): Promise<{ brandId: string, categoryId: string }> {
  const supabase = await getSupabaseClient();
  
  // 1. Resolver Marca
  let brandId = "";
  const { data: brandData } = await supabase.from("marcas").select("id").ilike("nombre", brandName).limit(1).maybeSingle();
  
  if (brandData) {
    brandId = brandData.id;
  } else {
    const { data: newBrand, error: errBrand } = await supabase.from("marcas").insert({ nombre: brandName.toUpperCase() }).select().single();
    if (errBrand) throw new Error(`Error creando marca: ${errBrand.message}`);
    brandId = newBrand.id;
  }

  // 2. Resolver Categoría
  let categoryId = "";
  const { data: catData } = await supabase.from("categorias_producto").select("id").ilike("nombre", categoryName).limit(1).maybeSingle();
  
  if (catData) {
    categoryId = catData.id;
  } else {
    const { data: newCat, error: errCat } = await supabase.from("categorias_producto").insert({ nombre: categoryName.toUpperCase() }).select().single();
    if (errCat) throw new Error(`Error creando categoría: ${errCat.message}`);
    categoryId = newCat.id;
  }

  return { brandId, categoryId };
}

/**
 * Resuelve y/o crea el Modelo en el Catálogo, asignándole una carpeta en Google Drive.
 */
export async function resolveCatalogModel(brandId: string, categoryId: string, brandName: string, modelName: string): Promise<string> {
  const supabase = await getSupabaseClient();

  const { data: catalogData } = await supabase
    .from("catalogo_productos")
    .select("id, drive_folder_id")
    .match({ marca_id: brandId })
    .ilike("modelo", modelName)
    .limit(1)
    .maybeSingle();

  if (catalogData) {
    if (!catalogData.drive_folder_id) {
       // Si existe pero no tiene carpeta, se la creamos
       const folderId = await getOrCreateFolderPath(`Inventario/${brandName}/${modelName}`);
       await supabase.from("catalogo_productos").update({ drive_folder_id: folderId }).match({ id: catalogData.id });
    }
    return catalogData.id;
  } else {
    // Crear el modelo nuevo y su carpeta
    const folderId = await getOrCreateFolderPath(`Inventario/${brandName}/${modelName}`);
    const { data: newCatalog, error } = await supabase.from("catalogo_productos").insert({
      marca_id: brandId,
      categoria_id: categoryId,
      modelo: modelName.toUpperCase(),
      drive_folder_id: folderId
    }).select().single();

    if (error) throw new Error(`Error creando modelo en catálogo: ${error.message}`);
    return newCatalog.id;
  }
}
