import { useEffect, useState } from 'react';
import type { Addon, MenuItem } from '../../types';
import { suggestHindiName } from '../../utils/hindi';

interface AddonDrawerProps {
  isOpen: boolean;
  /** When set, the drawer is in edit mode */
  editingAddon: (Addon & { parentItemId: string }) | null;
  /** All items available as parent options, grouped by category */
  menuItems: MenuItem[];
  /** Pre-selected parent item id (e.g. when opened from an item's row) */
  defaultParentItemId?: string;
  onClose: () => void;
  onSubmit: (parentItemId: string, data: Omit<Addon, 'id'>) => void;
}

const EMPTY = { name: '', hindiName: '', price: '', parentItemId: '' };

export default function AddonDrawer({
  isOpen,
  editingAddon,
  menuItems,
  defaultParentItemId,
  onClose,
  onSubmit,
}: AddonDrawerProps) {
  const [form, setForm] = useState(EMPTY);
  const [hindiEdited, setHindiEdited] = useState(false);

  // Sync form when drawer opens / editingAddon changes
  useEffect(() => {
    if (isOpen) {
      if (editingAddon) {
        setForm({
          name: editingAddon.name,
          hindiName: editingAddon.localizedNameHi ?? '',
          price: String(editingAddon.price),
          parentItemId: editingAddon.parentItemId,
        });
        setHindiEdited(Boolean(editingAddon.localizedNameHi));
      } else {
        setForm({ ...EMPTY, parentItemId: defaultParentItemId ?? '' });
        setHindiEdited(false);
      }
    } else {
      setForm(EMPTY);
      setHindiEdited(false);
    }
  }, [isOpen, editingAddon, defaultParentItemId]);

  const handleNameChange = (value: string) => {
    setForm(f => ({ ...f, name: value }));
    if (!value.trim()) {
      setForm(f => ({ ...f, hindiName: '' }));
      setHindiEdited(false);
    }
  };

  useEffect(() => {
    const trimmedName = form.name.trim();
    if (!trimmedName) {
      if (!hindiEdited) {
        setForm(f => ({ ...f, hindiName: '' }));
      }
      return;
    }

    if (hindiEdited && form.hindiName.trim() !== '') {
      return;
    }

    const delayDebounceFn = setTimeout(() => {
      void (async () => {
        const suggestion = await suggestHindiName(trimmedName);
        if (suggestion) {
          setForm(f => ({ ...f, hindiName: suggestion }));
        }
      })();
    }, 450);

    return () => clearTimeout(delayDebounceFn);
  }, [form.name, hindiEdited, form.hindiName]);

  const handleSubmit = () => {
    const name = form.name.trim();
    const parentItemId = form.parentItemId.trim();
    if (!name || !parentItemId) return;
    const price = parseFloat(form.price) || 0;
    onSubmit(parentItemId, {
      name,
      localizedNameHi: form.hindiName.trim() || undefined,
      price,
    });
  };

  // Build grouped options for the parent item selector
  const groupedOptions = (() => {
    const groups = new Map<string, MenuItem[]>();
    for (const item of menuItems) {
      const list = groups.get(item.category) ?? [];
      list.push(item);
      groups.set(item.category, list);
    }
    return groups;
  })();

  const isEditing = Boolean(editingAddon);
  const hindiPlaceholder = 'Auto-generated from name';

  return (
    <aside className={`menu-drawer${isOpen ? ' open' : ''}`} aria-label={isEditing ? 'Edit Add-on' : 'Add Add-on'}>
      <div className="menu-drawer-header">
        <div>
          <h2>{isEditing ? 'Edit Add-on' : 'Add Add-on'}</h2>
          <small style={{ opacity: 0.6, fontWeight: 400, fontSize: '0.78rem' }}>
            Child of a menu item
          </small>
        </div>
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
      </div>

      <div className="menu-drawer-body">
        {/* Parent item picker */}
        <div className="form-group">
          <label className="form-label">Parent Item*</label>
          <select
            className="input-field"
            value={form.parentItemId}
            onChange={e => setForm(f => ({ ...f, parentItemId: e.target.value }))}
          >
            <option value="">Select parent item</option>
            {Array.from(groupedOptions.entries()).map(([category, items]) => (
              <optgroup key={category} label={category}>
                {items.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Add-on name */}
        <div className="form-group">
          <label className="form-label">Name*</label>
          <input
            className="input-field"
            value={form.name}
            onChange={e => handleNameChange(e.target.value)}
            placeholder="Extra Cheese"
            autoFocus={isOpen}
          />
        </div>

        {/* Hindi name */}
        <div className="form-group">
          <label className="form-label">Hindi Name</label>
          <input
            className="input-field"
            value={form.hindiName}
            onChange={e => { setForm(f => ({ ...f, hindiName: e.target.value })); setHindiEdited(true); }}
            placeholder={hindiPlaceholder}
          />
        </div>

        {/* Extra price */}
        <div className="form-group">
          <label className="form-label">Extra Price (₹)</label>
          <input
            className="input-field"
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={form.price}
            onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
          />
          <small style={{ color: 'var(--muted)', fontSize: '0.76rem', marginTop: 4, display: 'block' }}>
            Set to 0 for a free / informational modifier
          </small>
        </div>
      </div>

      <div className="menu-drawer-footer">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button
          className="drawer-primary-action"
          onClick={handleSubmit}
          disabled={!form.name.trim() || !form.parentItemId}
        >
          {isEditing ? 'Save Changes' : 'Add Add-on'}
        </button>
      </div>
    </aside>
  );
}
