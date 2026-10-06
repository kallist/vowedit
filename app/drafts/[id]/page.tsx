import DraftEditor from '@/frontend/DraftEditor';
export default async function DraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DraftEditor id={id} />;
}
