import { NavLinks } from "./nav-links";

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 w-64 border-r border-gray-200 bg-white">
      <div className="flex h-16 items-center border-b border-gray-200 px-6">
        <h1 className="text-xl font-bold text-brand-700">Dealy</h1>
      </div>
      <div className="px-3 py-4">
        <NavLinks />
      </div>
    </aside>
  );
}
