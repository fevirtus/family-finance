import { apiFetch } from "@/lib/api";
import type { Category } from "@/lib/types";
import { CategoriesView } from "./categories-view";

export default async function CategoriesPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const categories = await apiFetch<Category[]>(
    `/groups/${groupId}/categories?include_archived=true`,
  );
  return <CategoriesView groupId={groupId} categories={categories} />;
}
