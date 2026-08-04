import { useInvoice } from '../state/useInvoice';
import { EditorPanel } from '../components/editor/EditorPanel';
import InvoicePreview from '../components/InvoicePreview';

export default function BuilderPage() {
  const inv = useInvoice();

  return (
    <div className="flex h-screen overflow-hidden bg-[#F8FAFC] max-md:flex-col">
      <aside className="flex w-[400px] shrink-0 flex-col border-r border-[#E8ECF4] bg-[#F8FAFC] max-md:h-1/2 max-md:w-full max-md:border-b max-md:border-r-0">
        <EditorPanel inv={inv} />
      </aside>
      <main className="flex flex-1 items-start justify-center overflow-auto bg-[#eef0f6] p-8">
        <InvoicePreview ref={inv.previewRef} state={inv.state} />
      </main>
    </div>
  );
}
