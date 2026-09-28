import ResultPage from "@/frontend/ResultPage";
export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ResultPage key={id} id={id} />;
}
