declare module "bwip-js" {
  type BarcodeOptions = {
    bcid: string;
    text: string;
    scale?: number;
    height?: number;
    includetext?: boolean;
    padding?: number;
    backgroundcolor?: string;
  };
  const bwipjs: { toBuffer(options: BarcodeOptions): Promise<Buffer> };
  export default bwipjs;
}
