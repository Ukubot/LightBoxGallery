interface GalleryImage {
  full: string;
  thumb: string;
  alt: string;
}

// Elements that can receive focus — used for trapping Tab inside the lightbox
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), ' +
  'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const SVG_PREV = `<svg width="12" height="18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M11 1 3 9l8 8" stroke="currentColor" stroke-width="3" fill="none" fill-rule="evenodd"/></svg>`;
const SVG_NEXT = `<svg width="13" height="18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="m2 1 8 8-8 8" stroke="currentColor" stroke-width="3" fill="none" fill-rule="evenodd"/></svg>`;
const SVG_CLOSE = `<svg width="14" height="15" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="m11.596.782 2.122 2.122L9.12 7.499l4.597 4.597-2.122 2.122L7 9.62l-4.595 4.597-2.122-2.122L4.878 7.5.282 2.904 2.404.782l4.595 4.596L11.596.782Z" fill="currentColor" fill-rule="evenodd"/></svg>`;

class ProductGallery extends HTMLElement {
  private images: GalleryImage[] = [];
  private index = 0;
  private lightboxOpen = false;
  private savedBodyOverflow = '';

  private readonly controller = new AbortController();
  private mq!: MediaQueryList;
  private readonly preloaded = new Set<string>();

  private mainImg!: HTMLImageElement;
  private lightboxTrigger!: HTMLButtonElement;
  private stageNavPrev!: HTMLButtonElement;
  private stageNavNext!: HTMLButtonElement;
  private thumbsEl!: HTMLElement;
  private thumbBtns: HTMLButtonElement[] = [];

  private lightboxEl!: HTMLElement;
  private lightboxImg!: HTMLImageElement;
  private lightboxNavPrev!: HTMLButtonElement;
  private lightboxNavNext!: HTMLButtonElement;
  private lightboxClose!: HTMLButtonElement;
  private lightboxBackdrop!: HTMLElement;
  private lightboxThumbsEl!: HTMLElement;
  private lightboxThumbBtns: HTMLButtonElement[] = [];
  private focusableEls: HTMLElement[] = [];

  private announcer!: HTMLElement;

  connectedCallback(): void {
    const sourceImgs = Array.from(this.querySelectorAll<HTMLImageElement>(':scope > img'));

    if (!sourceImgs.length) {
      console.error('[product-gallery] No <img> elements found in', this);
      return;
    }

    this.images = sourceImgs.map(img => ({
      full: img.src,
      thumb: img.dataset.thumb ?? img.src,
      alt: img.alt,
    }));

    const desktopBreakpoint = Number(this.dataset.desktopBreakpoint ?? 768);
    const startIndex = Number(this.dataset.startIndex ?? 0);

    this.mq = window.matchMedia(`(min-width: ${desktopBreakpoint}px)`);
    this.index = Math.max(0, Math.min(startIndex, this.images.length - 1));

    this.innerHTML = '';
    this.buildDOM();
    this.bindEvents();
    this.renderMain();
    this.preloadAdjacent();
  }

  disconnectedCallback(): void {
    this.controller.abort();
    document.body.style.overflow = this.savedBodyOverflow;
  }

  goTo(index: number): void {
    if (index < 0 || index >= this.images.length) return;
    this.setIndex(index);
  }

  private buildDOM(): void {
    const multi = this.images.length > 1;

    this.announcer = this.make('div', {
      class: 'gallery__announcer',
      'aria-live': 'polite',
      'aria-atomic': 'true',
    });

    this.mainImg = this.make('img', { class: 'gallery__img', src: this.images[0].full, alt: '' });

    // display:none on mobile removes this from the a11y tree, so keyboard
    // users never encounter a button that does nothing on mobile.
    this.lightboxTrigger = this.make('button', {
      class: 'gallery__lightbox-trigger',
      type: 'button',
      'aria-label': 'Open image in lightbox',
      'aria-haspopup': 'dialog',
    });

    const frame = this.make('div', { class: 'gallery__frame' });
    frame.append(this.mainImg, this.lightboxTrigger);

    this.stageNavPrev = this.makeNavBtn('prev');
    this.stageNavNext = this.makeNavBtn('next');

    const stage = this.make('div', { class: 'gallery__stage' });
    stage.append(this.stageNavPrev, frame, this.stageNavNext);

    this.thumbsEl = this.make('div', { class: 'gallery__thumbs', role: 'group', 'aria-label': 'Select product image' });
    if (multi) {
      this.thumbBtns = this.images.map((img, i) => this.makeThumbBtn(img, i));
      this.thumbsEl.append(...this.thumbBtns);
    }

    this.lightboxBackdrop = this.make('div', { class: 'gallery__lightbox-backdrop', 'aria-hidden': 'true' });

    this.lightboxClose = this.make('button', {
      class: 'gallery__lightbox-close',
      type: 'button',
      'aria-label': 'Close lightbox',
    });
    this.lightboxClose.innerHTML = SVG_CLOSE;

    const toolbar = this.make('div', { class: 'gallery__lightbox-toolbar' });
    toolbar.append(this.lightboxClose);

    this.lightboxImg = this.make('img', { class: 'gallery__lightbox-img', src: this.images[0].full, alt: '' });

    this.lightboxNavPrev = this.makeNavBtn('prev');
    this.lightboxNavNext = this.makeNavBtn('next');

    const lightboxStage = this.make('div', { class: 'gallery__lightbox-stage' });
    lightboxStage.append(this.lightboxNavPrev, this.lightboxImg, this.lightboxNavNext);

    this.lightboxThumbsEl = this.make('div', { class: 'gallery__lightbox-thumbs', role: 'group', 'aria-label': 'Select product image' });
    if (multi) {
      this.lightboxThumbBtns = this.images.map((img, i) => this.makeThumbBtn(img, i));
      this.lightboxThumbsEl.append(...this.lightboxThumbBtns);
    }

    if (!multi) {
      this.stageNavPrev.hidden = true;
      this.stageNavNext.hidden = true;
      this.lightboxNavPrev.hidden = true;
      this.lightboxNavNext.hidden = true;
    }

    const dialog = this.make('div', { class: 'gallery__lightbox-dialog' });
    dialog.append(toolbar, lightboxStage, this.lightboxThumbsEl);

    this.lightboxEl = this.make('div', {
      class: 'gallery__lightbox',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': 'Product image lightbox',
      'aria-hidden': 'true',
    });
    this.lightboxEl.append(this.lightboxBackdrop, dialog);

    this.append(this.announcer, stage, this.thumbsEl, this.lightboxEl);
  }

  private makeNavBtn(direction: 'prev' | 'next'): HTMLButtonElement {
    const btn = this.make('button', {
      class: `gallery__nav gallery__nav--${direction}`,
      type: 'button',
      'aria-label': direction === 'prev' ? 'Previous image' : 'Next image',
    });
    btn.innerHTML = direction === 'prev' ? SVG_PREV : SVG_NEXT;
    return btn;
  }

  private makeThumbBtn(img: GalleryImage, index: number): HTMLButtonElement {
    const btn = this.make('button', {
      class: 'gallery__thumb',
      type: 'button',
      'aria-pressed': 'false',
      'aria-label': `Image ${index + 1} of ${this.images.length}`,
      'data-gallery-index': String(index),
    });

    const imgEl = this.make('img', {
      src: img.thumb,
      alt: '', // decorative — the button label is the accessible name
      'aria-hidden': 'true',
    });
    if (index > 0) imgEl.setAttribute('loading', 'lazy');

    btn.append(imgEl);
    return btn;
  }

  private make<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    attrs: Record<string, string> = {},
  ): HTMLElementTagNameMap[K] {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  }

  private bindEvents(): void {
    const listenerOpts = { signal: this.controller.signal };

    this.stageNavPrev.addEventListener('click', () => this.step(-1), listenerOpts);
    this.stageNavNext.addEventListener('click', () => this.step(+1), listenerOpts);

    // guarded in JS too in case the stylesheet hasn't loaded yet when the click fires
    this.lightboxTrigger.addEventListener('click', () => {
      if (this.mq.matches) this.openLightbox();
    }, listenerOpts);

    this.thumbsEl.addEventListener('click', (e) => this.onThumbClick(e), listenerOpts);

    this.lightboxNavPrev.addEventListener('click', () => this.step(-1), listenerOpts);
    this.lightboxNavNext.addEventListener('click', () => this.step(+1), listenerOpts);
    this.lightboxThumbsEl.addEventListener('click', (e) => this.onThumbClick(e), listenerOpts);
    this.lightboxClose.addEventListener('click', () => this.closeLightbox(), listenerOpts);
    this.lightboxBackdrop.addEventListener('click', () => this.closeLightbox(), listenerOpts);

    document.addEventListener('keydown', (e) => this.onKeydown(e), listenerOpts);
    this.lightboxEl.addEventListener('keydown', (e) => this.trapFocus(e), listenerOpts);
    this.mq.addEventListener('change', () => { if (!this.mq.matches && this.lightboxOpen) this.closeLightbox(); }, listenerOpts);
  }

  private step(dir: number): void {
    const total = this.images.length;
    this.setIndex((this.index + dir + total) % total);
  }

  private onThumbClick(e: MouseEvent): void {
    const btn = (e.target as Element).closest<HTMLButtonElement>('[data-gallery-index]');
    if (!btn) return;
    const i = parseInt(btn.dataset.galleryIndex ?? '', 10);
    if (!Number.isNaN(i)) this.setIndex(i);
  }

  private setIndex(i: number): void {
    this.index = i;
    if (this.lightboxOpen) {
      this.renderLightbox();
    } else {
      this.renderMain();
    }
    this.preloadAdjacent();
  }

  private renderImg(imgEl: HTMLImageElement, thumbBtns: HTMLButtonElement[]): void {
    const img = this.images[this.index];
    imgEl.classList.remove('is-broken');
    imgEl.onerror = () => imgEl.classList.add('is-broken');
    imgEl.src = img.full;
    imgEl.alt = `${img.alt} — image ${this.index + 1} of ${this.images.length}`;
    this.syncThumbs(thumbBtns);
  }

  private renderMain(): void {
    this.renderImg(this.mainImg, this.thumbBtns);
    this.announce(`Image ${this.index + 1} of ${this.images.length}`);
  }

  private renderLightbox(): void {
    this.renderImg(this.lightboxImg, this.lightboxThumbBtns);
  }

  private syncThumbs(btns: HTMLButtonElement[]): void {
    btns.forEach((btn, i) => {
      const active = i === this.index;
      btn.classList.toggle('gallery__thumb--active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }

  private preloadAdjacent(): void {
    const total = this.images.length;
    if (total < 2) return;

    for (const dir of [-1, 1]) {
      const href = this.images[(this.index + dir + total) % total].full;
      if (this.preloaded.has(href)) continue;
      this.preloaded.add(href);
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = href;
      document.head.appendChild(link);
    }
  }

  private openLightbox(): void {
    this.lightboxOpen = true;
    this.lightboxEl.classList.add('gallery__lightbox--open');
    this.lightboxEl.setAttribute('aria-hidden', 'false');
    this.savedBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    this.renderLightbox();
    this.focusableEls = this.queryFocusable();
    this.lightboxClose.focus();
  }

  private closeLightbox(): void {
    this.lightboxOpen = false;
    this.focusableEls = [];
    this.lightboxEl.classList.remove('gallery__lightbox--open');
    this.lightboxEl.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = this.savedBodyOverflow;
    this.renderMain();
    this.lightboxTrigger.focus();
  }

  private queryFocusable(): HTMLElement[] {
    return Array.from(
      this.lightboxEl.querySelectorAll<HTMLElement>(FOCUSABLE),
    ).filter((el) => !el.closest('[hidden]') && el.offsetParent !== null);
  }

  private onKeydown(e: KeyboardEvent): void {
    if (!this.lightboxOpen) return;

    switch (e.key) {
      case 'Escape': e.preventDefault(); this.closeLightbox(); break;
      case 'ArrowLeft': e.preventDefault(); this.step(-1); break;
      case 'ArrowRight': e.preventDefault(); this.step(+1); break;
    }
  }

  private trapFocus(e: KeyboardEvent): void {
    if (e.key !== 'Tab' || !this.focusableEls.length) return;

    const first = this.focusableEls[0];
    const last = this.focusableEls[this.focusableEls.length - 1];
    const active = document.activeElement;

    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  // clears then re-sets on the next frame — some screen readers debounce
  // announcements and won't re-read a region if the text hasn't changed
  private announce(message: string): void {
    this.announcer.textContent = '';
    requestAnimationFrame(() => { this.announcer.textContent = message; });
  }
}

customElements.define('product-gallery', ProductGallery);
