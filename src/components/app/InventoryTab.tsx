import { useEffect, useRef } from 'react';
import Icon from '../shared/Icon';
import type { Addon, MenuItem } from '../../types';
import { formatCurrency } from '../../utils/currencyUtils';

interface InventoryTabProps {
  menuItems: MenuItem[];
  inventoryCategories: string[];
  visibleMenuGroupCount: number;
  menuSearch: string;
  addNewOpen: boolean;
  menuGroups: Map<string, MenuItem[]>;
  expandedMenuCategories: Set<string>;
  expandedAddonGroups: Set<string>;
  inlineEditingId: string | null;
  inlineName: string;
  onMenuSearchChange: (value: string) => void;
  onToggleAddNew: () => void;
  onOpenAddCategory: () => void;
  onOpenMenuDrawer: (item?: MenuItem | null, category?: string) => void;
  onOpenAddonDrawer: (addon?: Addon & { parentItemId: string }, parentItemId?: string) => void;
  onToggleMenuCategory: (category: string) => void;
  onToggleAddonGroup: (itemId: string) => void;
  onOpenEditCategory: (name: string) => void;
  onSetDeleteCategoryTarget: (name: string) => void;
  onStartInlineEdit: (item: MenuItem) => void;
  onInlineNameChange: (value: string) => void;
  onCommitInlineEdit: (item: MenuItem) => void;
  onCancelInlineEdit: () => void;
  onToggleMenuActive: (item: MenuItem) => void;
  onSetDeleteMenuItem: (item: MenuItem) => void;
  onRemoveAddon: (itemId: string, addonId: string) => void;
}

export default function InventoryTab({
  menuItems,
  inventoryCategories,
  visibleMenuGroupCount,
  menuSearch,
  addNewOpen,
  menuGroups,
  expandedMenuCategories,
  expandedAddonGroups,
  inlineEditingId,
  inlineName,
  onMenuSearchChange,
  onToggleAddNew,
  onOpenAddCategory,
  onOpenMenuDrawer,
  onOpenAddonDrawer,
  onToggleMenuCategory,
  onToggleAddonGroup,
  onOpenEditCategory,
  onSetDeleteCategoryTarget,
  onStartInlineEdit,
  onInlineNameChange,
  onCommitInlineEdit,
  onCancelInlineEdit,
  onToggleMenuActive,
  onSetDeleteMenuItem,
  onRemoveAddon,
}: InventoryTabProps) {
  // Collect items that have at least one add-on for the Add-ons section
  const itemsWithAddons = menuItems.filter(item => item.addons && item.addons.length > 0);
  const totalAddons = itemsWithAddons.reduce((sum, item) => sum + (item.addons?.length ?? 0), 0);

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!addNewOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onToggleAddNew();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [addNewOpen, onToggleAddNew]);

  return (
    <div className="menu-ops-shell">
      <div className="menu-ops-header">
        <div>
          <h2>Inventory</h2>
          <div className="menu-ops-meta">{menuItems.length} items · {visibleMenuGroupCount} active groups</div>
        </div>
        <div className="menu-add-wrap" ref={dropdownRef}>
          <button className="menu-add-new" onClick={onToggleAddNew}>+ Add New</button>
          {addNewOpen && (
            <div className="menu-add-dropdown">
              <button type="button" onClick={() => { onToggleAddNew(); onOpenAddCategory(); }}>Category</button>
              <button type="button" onClick={() => { onToggleAddNew(); onOpenMenuDrawer(); }}>Item</button>
              <button type="button" onClick={() => { onToggleAddNew(); onOpenAddonDrawer(); }}>Add-on</button>
            </div>
          )}
        </div>
      </div>

      <div className="menu-search-row">
        <Icon name="search" size={18} />
        <input
          type="search"
          placeholder="Search menu items, categories, modifiers..."
          value={menuSearch}
          onChange={event => onMenuSearchChange(event.target.value)}
        />
      </div>

      {menuItems.length === 0 && inventoryCategories.length === 0 ? (
        <div className="menu-empty-ops">
          <div className="menu-empty-art" aria-hidden="true">
            <svg viewBox="0 0 180 140" role="img" focusable="false">
              <rect x="42" y="18" width="96" height="112" rx="14" fill="#fffaf1" stroke="currentColor" strokeOpacity="0.22" strokeWidth="2" />
              <path d="M62 48h56M62 66h42M62 84h52" stroke="currentColor" strokeOpacity="0.26" strokeWidth="5" strokeLinecap="round" />
              <circle cx="56" cy="48" r="4" fill="currentColor" opacity="0.55" />
              <circle cx="56" cy="66" r="4" fill="currentColor" opacity="0.55" />
              <circle cx="56" cy="84" r="4" fill="currentColor" opacity="0.55" />
              <path d="M30 104c12 11 28 17 48 17h30c18 0 31-5 42-16" stroke="currentColor" strokeWidth="4" strokeLinecap="round" fill="none" />
              <path d="M73 24c2-10 8-15 17-15s15 5 17 15" stroke="currentColor" strokeWidth="4" strokeLinecap="round" fill="none" />
            </svg>
          </div>
          <div>
            <div className="empty-title">No menu items yet</div>
            <div className="empty-subtitle">Your menu will appear here once items are added.</div>
          </div>
        </div>
      ) : (
        <div className="menu-ops-groups">
          {/* ── Items grouped by category ── */}
          {Array.from(menuGroups.entries()).map(([category, items]) => {
            const collapsed = !expandedMenuCategories.has(category);

            return (
              <section key={category} className="menu-ops-group">
                <div className="menu-ops-group-title-row">
                  <button type="button" className="menu-ops-group-title" onClick={() => onToggleMenuCategory(category)}>
                    <span>{category.toUpperCase()}</span>
                    <span className="menu-ops-group-meta">
                      {items.length} {items.length === 1 ? 'item' : 'items'}
                      <span className={`menu-ops-group-arrow${collapsed ? ' collapsed' : ''}`}><Icon name="down" size={14} /></span>
                    </span>
                  </button>
                  <div className="menu-ops-group-actions">
                    <button type="button" className="menu-cat-action" title="Rename category" onClick={event => { event.stopPropagation(); onOpenEditCategory(category); }}>
                      <Icon name="edit" size={14} />
                    </button>
                    <button type="button" className="menu-cat-action danger" title="Delete category and all items" onClick={event => { event.stopPropagation(); onSetDeleteCategoryTarget(category); }}>
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                </div>
                <div className={`menu-ops-group-body${collapsed ? ' collapsed' : ''}`}>
                  {items.length === 0 ? (
                    <div className="orders-empty" style={{ padding: '16px 20px', fontSize: '0.85rem' }}>
                      No items in this category yet.
                    </div>
                  ) : items.map(item => {
                    const active = item.isActive !== false;

                    return (
                      <div
                        key={item.id}
                        className={`menu-ops-row${active ? '' : ' disabled'}`}
                      >
                        <div className="menu-row-thumb">
                          {item.image ? <img src={item.image} alt="" /> : <span className="menu-row-thumb-default">{item.name.slice(0, 1).toUpperCase()}</span>}
                        </div>
                        <div className="menu-row-main">
                          {inlineEditingId === item.id ? (
                            <input
                              className="menu-inline-input"
                              value={inlineName}
                              autoFocus
                              onChange={event => onInlineNameChange(event.target.value)}
                              onBlur={() => onCommitInlineEdit(item)}
                              onKeyDown={event => {
                                if (event.key === 'Enter') onCommitInlineEdit(item);
                                if (event.key === 'Escape') onCancelInlineEdit();
                              }}
                            />
                          ) : (
                            <button type="button" className="menu-row-name" onClick={() => onStartInlineEdit(item)}>
                              {item.name}
                            </button>
                          )}
                          <span>
                            {formatCurrency(item.price)} · {active ? 'Available' : 'Disabled'}
                            {item.isNonProfit ? ' · Non-profit' : ''}
                            {item.addons && item.addons.length > 0 && (
                              <span className="addon-count-badge">{item.addons.length} add-on{item.addons.length !== 1 ? 's' : ''}</span>
                            )}
                          </span>
                        </div>
                        <button type="button" className="menu-row-action" onClick={() => onOpenMenuDrawer(item)} title="Edit item">
                          <Icon name="edit" size={16} />
                        </button>
                        <button type="button" className="menu-row-action" onClick={() => onToggleMenuActive(item)} title={active ? 'Disable' : 'Enable'}>
                          {active ? 'On' : 'Off'}
                        </button>
                        <button type="button" className="menu-row-action danger" onClick={() => onSetDeleteMenuItem(item)} title="Delete item">
                          <Icon name="trash" size={16} />
                        </button>
                      </div>
                    );
                  })}
                  <div className="menu-group-actions">
                    <button type="button" onClick={() => onOpenMenuDrawer(null, category)}>+ Add Item</button>
                  </div>
                </div>
              </section>
            );
          })}

          {/* ── Add-ons section ── */}
          <section className="menu-ops-group addon-master-section">
            <div className="menu-ops-group-title-row addon-section-header">
              <div className="addon-section-label">
                <div>ADD-ONS</div>
                <div className="menu-ops-group-meta" style={{ marginLeft: 8 }}>
                  {totalAddons} total · {itemsWithAddons.length} items
                </div>
              </div>
            </div>

            {itemsWithAddons.length === 0 ? (
              <div className="orders-empty" style={{ padding: '16px 20px', fontSize: '0.85rem' }}>
                No add-ons yet. Use <strong>+ Add New → Add-on</strong> to create one.
              </div>
            ) : (
              <div className="addon-section-body">
                {itemsWithAddons.map(item => {
                  const addonGroupCollapsed = !expandedAddonGroups.has(item.id);
                  return (
                    <div key={item.id} className="addon-parent-group">
                      <button
                        type="button"
                        className="addon-parent-title"
                        onClick={() => onToggleAddonGroup(item.id)}
                      >
                        <span className="addon-parent-name">{item.name}</span>
                        <span className="menu-ops-group-meta">
                          <span className="addon-count">{item.addons!.length} add-on{item.addons!.length !== 1 ? 's' : ''}</span>
                          <span className={`menu-ops-group-arrow${addonGroupCollapsed ? ' collapsed' : ''}`}>
                            <Icon name="down" size={13} />
                          </span>
                        </span>
                      </button>
                      {!addonGroupCollapsed && (
                        <div className="addon-child-list">
                          {item.addons!.map(addon => (
                            <div key={addon.id} className="addon-inventory-row">
                              <div className="addon-row-info">
                                <span className="addon-row-name">{addon.name}</span>
                                {addon.localizedNameHi && (
                                  <span className="addon-row-hindi">{addon.localizedNameHi}</span>
                                )}
                                <span className="addon-row-price">
                                  {addon.price > 0 ? `+${formatCurrency(addon.price)}` : 'Free'}
                                </span>
                              </div>
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button
                                  type="button"
                                  className="menu-row-action"
                                  title="Edit add-on"
                                  onClick={() => onOpenAddonDrawer({ ...addon, parentItemId: item.id })}
                                >
                                  <Icon name="edit" size={14} />
                                </button>
                                <button
                                  type="button"
                                  className="menu-row-action danger"
                                  title="Remove add-on"
                                  onClick={() => onRemoveAddon(item.id, addon.id)}
                                >
                                  <Icon name="trash" size={14} />
                                </button>
                              </div>
                            </div>
                          ))}
                          <div className="menu-group-actions">
                            <button type="button" onClick={() => onOpenAddonDrawer(undefined, item.id)}>
                              + More Add-ons
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
