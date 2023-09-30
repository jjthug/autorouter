import express, { NextFunction, Request, Response } from 'express';
import { BestRouteRequest, BestRouteResponse, getBestRoute } from './routeHandler';
import morgan from 'morgan';
import {TradeType } from '@uniswap/sdk-core';
import cors from 'cors';

require('dotenv').config();

const corsOptions = {
  origin: [`${process.env.ORIGIN_URL}`], // Replace this with your frontend app's URL
  methods: ['GET', 'OPTIONS'],
  allowedHeaders: ['Accept','App-Id','Authorization','Content-Type','Referer','uapk','uapm','uasm','User-Agent'],
};

const app = express();
app.use(morgan('combined'));

app.use(express.json());
app.use(cors(corsOptions));


app.get("/getBestRoute", async (req: Request, res: Response) => {
  try {
    let tradeType;
    if(req.query.tradeType == "EXACT_IN")
      tradeType = TradeType.EXACT_INPUT;
    else if(req.query.tradeType == "EXACT_OUT")
      tradeType = TradeType.EXACT_OUTPUT;
    else{
      throw Error("incorrect trade type");
    }

    const data: BestRouteRequest = {
      chainId: Number(req.query.chainId),
      InputAmount: String(req.query.inputAmount),
      tokenIn: {
        address: String(req.query.tokenInAddress),
        decimals: Number(req.query.tokenInDecimals),
        symbol: String(req.query.tokenInSymbol)
      },
      tokenOut: {
        address: String(req.query.tokenOutAddress),
        decimals: Number(req.query.tokenOutDecimals),
        symbol: String(req.query.tokenOutSymbol)
      },
      maxSplits: Number(req.query.maxSplits || 1),
      maxSwapsPerPath: Number(req.query.maxSwapsPerPath || 1),
      tradeType: tradeType
    };

    const result: BestRouteResponse = await getBestRoute(data);
    res.json(result);
  } catch (e) {
    res.status(500).json({"error":e})
  }
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Error:", err);
  res.status(500).json({ error: "Internal Server Error" });
});

app.listen(process.env.SERVER_PORT, () => {
  console.log(`Server running on port ${process.env.SERVER_PORT}`);
});