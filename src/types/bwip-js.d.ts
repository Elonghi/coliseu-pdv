declare module "bwip-js" {
  type BarcodeOptions = {
    bcid: string;
    text: string;
    scale?: number;
    height?: number;
    includetext?: boolean;
    padding?: number;
    backgroundcolor?: string;
    barcolor?: string;
    eclevel?: string;
  };
  const bwipjs: { toBuffer(options: BarcodeOptions): Promise<Buffer>; toSVG(options: BarcodeOptions): string };
  export default bwipjs;
}
