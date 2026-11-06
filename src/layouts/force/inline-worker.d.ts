declare module '*?worker&inline' {
  const InlineWorker: new (options?: { readonly name?: string }) => Worker
  export default InlineWorker
}
