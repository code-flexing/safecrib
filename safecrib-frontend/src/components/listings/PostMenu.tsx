"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";

type MenuItem = {
  label: string;
  onClick: () => void;
  icon?: string;
  danger?: boolean;
  disabled?: boolean;
};

type PostMenuProps = {
  items: MenuItem[];
  triggerLabel?: string;
  className?: string;
};

export function PostMenu({ items, triggerLabel = "More options", className = "" }: PostMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (menuRef.current && !menuRef.current.contains(target) &&
          buttonRef.current && !buttonRef.current.contains(target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside as EventListener);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside as EventListener);
    };
  }, []);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }
    if (isOpen) document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen]);

  const filteredItems = items.filter((item) => !/open post/i.test(item.label));

  const handleItemClick = (item: MenuItem) => {
    if (!item.disabled) {
      item.onClick();
      setIsOpen(false);
    }
  };

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={triggerLabel}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-10 w-10 items-center justify-center rounded-full text-black/50 transition-colors hover:bg-black/[0.04] hover:text-black"
      >
        <Icon name="more-horizontal" className="h-5 w-5" />
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          role="menu"
          className="absolute right-0 z-20 mt-2 min-w-[180px] origin-top-right rounded-lg border border-black/10 bg-white shadow-lg animate-in fade-in-0 zoom-in-95"
        >
          {filteredItems.map((item, index) => (
            <button
              key={index}
              type="button"
              role="menuitem"
              tabIndex={-1}
              disabled={item.disabled}
              onClick={() => handleItemClick(item)}
              className={`flex w-full items-center gap-3 px-3 py-2.5 text-sm text-left transition-colors ${
                item.danger
                  ? "text-red-600 hover:bg-red-50"
                  : "text-black/80 hover:bg-black/[0.03]"
              } ${item.disabled ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {item.icon && <Icon name={item.icon} className="h-4 w-4 shrink-0" />}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}