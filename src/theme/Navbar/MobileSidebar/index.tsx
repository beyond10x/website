import React, {type ReactNode, useEffect, useLayoutEffect, useRef} from 'react';
import {
  useLockBodyScroll,
  useNavbarMobileSidebar,
  useNavbarSecondaryMenu,
} from '@docusaurus/theme-common/internal';
import NavbarMobileSidebarLayout from '@theme/Navbar/MobileSidebar/Layout';
import NavbarMobileSidebarHeader from '@theme/Navbar/MobileSidebar/Header';
import NavbarMobileSidebarPrimaryMenu from '@theme/Navbar/MobileSidebar/PrimaryMenu';
import NavbarMobileSidebarSecondaryMenu from '@theme/Navbar/MobileSidebar/SecondaryMenu';

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function isRendered(element: HTMLElement): boolean {
  const bounds = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return bounds.width > 0
    && bounds.height > 0
    && style.display !== 'none'
    && style.visibility !== 'hidden'
    && !element.closest('[inert], [aria-hidden="true"]');
}

function focusableElements(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(focusableSelector)].filter(isRendered);
}

function activeDrawerPanel(drawer: HTMLElement): HTMLElement | undefined {
  return [...drawer.querySelectorAll<HTMLElement>('.navbar-sidebar__item')]
    .find((panel) => !panel.inert);
}

function focusActiveDrawerView(): boolean {
  const drawer = document.querySelector<HTMLElement>('.navbar-sidebar');
  if (!drawer) return false;
  const panel = activeDrawerPanel(drawer);
  const target = (panel ? focusableElements(panel)[0] : undefined)
    ?? focusableElements(drawer)[0];
  if (!target) return false;
  target.focus({preventScroll: true});
  return document.activeElement === target;
}

function useAccessibleDrawerFocus({
  shown,
  secondaryMenuShown,
  toggle,
}: {
  shown: boolean;
  secondaryMenuShown: boolean;
  toggle: () => void;
}): void {
  const trigger = useRef<HTMLElement | null>(null);
  const wasShown = useRef(false);

  useLayoutEffect(() => {
    if (shown && !wasShown.current) {
      const active = document.activeElement;
      trigger.current = active instanceof HTMLElement && active.matches('.navbar__toggle')
        ? active
        : document.querySelector<HTMLElement>('.navbar__toggle');
    }

    if (shown) {
      const focusWhenReady = (remainingAttempts: number) => {
        const toggleElement = document.querySelector<HTMLElement>('.navbar__toggle');
        if (toggleElement?.getAttribute('aria-expanded') !== 'true') return;
        const drawer = document.querySelector<HTMLElement>('.navbar-sidebar');
        const panel = drawer ? activeDrawerPanel(drawer) : undefined;
        const active = document.activeElement;
        if (panel && active instanceof Node && panel.contains(active)) return;
        if (!focusActiveDrawerView() && remainingAttempts > 0) {
          window.setTimeout(() => focusWhenReady(remainingAttempts - 1), 16);
        }
      };
      window.setTimeout(() => focusWhenReady(20));
    } else if (!shown && wasShown.current) {
      const returnTarget = trigger.current;
      if (returnTarget?.isConnected) returnTarget.focus({preventScroll: true});
    }

    wasShown.current = shown;
  }, [secondaryMenuShown, shown]);

  useEffect(() => {
    if (!shown) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        toggle();
        return;
      }
      if (event.key !== 'Tab') return;

      const drawer = document.querySelector<HTMLElement>('.navbar-sidebar');
      if (!drawer) return;
      const focusable = focusableElements(drawer);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const current = document.activeElement;
      const index = current instanceof HTMLElement ? focusable.indexOf(current) : -1;
      if (index === -1 || (!event.shiftKey && index === focusable.length - 1)) {
        event.preventDefault();
        focusable[0].focus({preventScroll: true});
      } else if (event.shiftKey && index === 0) {
        event.preventDefault();
        focusable[focusable.length - 1].focus({preventScroll: true});
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [shown, toggle]);
}

export default function NavbarMobileSidebar(): ReactNode {
  const mobileSidebar = useNavbarMobileSidebar();
  const secondaryMenu = useNavbarSecondaryMenu();
  useLockBodyScroll(mobileSidebar.shown);
  useAccessibleDrawerFocus({
    shown: mobileSidebar.shown,
    secondaryMenuShown: secondaryMenu.shown,
    toggle: mobileSidebar.toggle,
  });

  if (!mobileSidebar.shouldRender) return null;

  return (
    <NavbarMobileSidebarLayout
      header={<NavbarMobileSidebarHeader />}
      primaryMenu={<NavbarMobileSidebarPrimaryMenu />}
      secondaryMenu={<NavbarMobileSidebarSecondaryMenu />}
    />
  );
}
