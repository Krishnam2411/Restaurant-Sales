import type { Addon, MenuItem } from '../../types';
import Icon from '../shared/Icon';

interface MenuDrawerProps {
  isOpen: boolean;
  editingMenuItem: MenuItem | null;
  inventoryCategories: string[];
  drawerName: string;
  drawerHindiName: string;
  drawerCategory: string;
  drawerDescription: string;
  drawerImage: string;
  drawerIsNonProfit: boolean;
  drawerDisabled: boolean;
  drawerPrice: string;
  drawerAddons: Addon[];
  onClose: () => void;
  onSubmit: () => void;
  onNameChange: (value: string) => void;
  onHindiNameChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onImageFileChange: (file: File | undefined) => void;
  onNonProfitChange: (value: boolean) => void;
  onDisabledChange: (value: boolean) => void;
  onPriceChange: (value: string) => void;
}

export default function MenuDrawer({
  isOpen,
  editingMenuItem,
  inventoryCategories,
  drawerName,
  drawerHindiName,
  drawerCategory,
  drawerDescription,
  drawerImage,
  drawerIsNonProfit,
  drawerDisabled,
  drawerPrice,
  drawerAddons,
  onClose,
  onSubmit,
  onNameChange,
  onHindiNameChange,
  onCategoryChange,
  onDescriptionChange,
  onImageFileChange,
  onNonProfitChange,
  onDisabledChange,
  onPriceChange,
}: MenuDrawerProps) {
  const placeholder = 'Auto-generated from item name';

  return (
    <aside className={`menu-drawer${isOpen ? ' open' : ''}`} aria-label="Add Item">
      <div className="menu-drawer-header">
        <div>
          <h2>{editingMenuItem ? 'Edit Item' : 'Add Item'}</h2>
        </div>
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
      </div>

      <div className="menu-drawer-body">
        <div className="form-group">
          <label className="form-label">Name*</label>
          <input
            className="input-field"
            value={drawerName}
            onChange={event => onNameChange(event.target.value)}
            placeholder="Paneer Tikka"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Hindi Name*</label>
          <input
            className="input-field"
            value={drawerHindiName}
            onChange={event => onHindiNameChange(event.target.value)}
            placeholder={placeholder}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Category*</label>
          <select className="input-field" value={drawerCategory} onChange={event => onCategoryChange(event.target.value)}>
            <option value="">Select existing category</option>
            {inventoryCategories.map(category => <option key={category} value={category}>{category}</option>)}
          </select>
        </div>

        <label className={`image-upload-box${drawerImage ? ' has-image' : ''}`}>
          {drawerImage ? (
            <img src={drawerImage} alt="" />
          ) : (
            <div className="default-item-image" aria-hidden="true">
              <Icon name="bowl" size={30} />
            </div>
          )}
          <span>{drawerImage ? 'Replace item image' : 'Optional item image'}</span>
          <input type="file" accept="image/*" onChange={event => onImageFileChange(event.target.files?.[0])} />
        </label>

        <div className="form-group">
          <label className="form-label">Description</label>
          <textarea className="input-field drawer-textarea" value={drawerDescription} onChange={event => onDescriptionChange(event.target.value)} placeholder="Basic item description" />
        </div>

        <label className="drawer-toggle">
          <span>
            <strong>Non-profit item</strong>
            <small>Included in bill but excluded from sales.</small>
          </span>
          <input type="checkbox" checked={drawerIsNonProfit} onChange={event => onNonProfitChange(event.target.checked)} />
        </label>

        <label className="drawer-toggle">
          <span>
            <strong>Disable</strong>
            <small>Makes item temporary unavailable.</small>
          </span>
          <input type="checkbox" checked={drawerDisabled} onChange={event => onDisabledChange(event.target.checked)} />
        </label>

        <section className="pricing-section">
          <div className="pricing-header">
            <div>
              <h3>Pricing (₹)*</h3>
            </div>
          </div>
          <div className="form-group">
            <input className="input-field" type="number" min="0" step="0.01" placeholder="0.00" value={drawerPrice} onChange={event => onPriceChange(event.target.value)} />
          </div>
        </section>

        {/* ── Add-ons — read-only summary ── */}
        {editingMenuItem && (
          <section className="pricing-section">
            <div className="pricing-header">
              <div>
                <h3>Add-ons</h3>
                <small style={{ fontWeight: 400, opacity: 0.7 }}>Manage from the Inventory tab</small>
              </div>
              {drawerAddons.length > 0 && (
                <span className="addon-count-badge" style={{ alignSelf: 'center' }}>
                  {drawerAddons.length} attached
                </span>
              )}
            </div>
            {drawerAddons.length > 0 ? (
              <div className="addon-list">
                {drawerAddons.map(addon => (
                  <div key={addon.id} className="addon-row addon-row-readonly">
                    <div className="addon-row-info">
                      <span className="addon-row-name">{addon.name}</span>
                      {addon.localizedNameHi && <span className="addon-row-hindi">{addon.localizedNameHi}</span>}
                      <span className="addon-row-price">
                        {addon.price > 0 ? `+₹${addon.price}` : 'Free'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: '0.82rem', opacity: 0.55, margin: '6px 0 0' }}>
                No add-ons attached. Use <strong>+ Add New → Add-on</strong> in the Inventory tab.
              </p>
            )}
          </section>
        )}
      </div>

      <div className="menu-drawer-footer">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="drawer-primary-action" onClick={onSubmit}>Save</button>
      </div>
    </aside>
  );
}