import { Button, buttonVariants } from "@/components/ui/button";
import { LoadingSection, LoadingSpinner } from "@/components/ui/loading";
import { client, promiseDataOrThrow } from "@/edenClient";
import { cn } from "@/lib/utils";
import { queryClient } from "@/query";
import {
  TransformedWhiteBoardPointGroup,
  WhiteBoardPublish,
} from "@fireside/backend/src/whiteboard-endpoints";
import { WhiteBoardImgSelect, WhiteBoardMouse } from "@fireside/db";

export const genWhiteBoardPointId = () =>
  "white_board_point_" + crypto.randomUUID();
export const whiteBoardColors = [
  "blue",
  "red",
  "green",
  "black",
  "white",
] as const;

import { queryOptions, useMutation, useQuery } from "@tanstack/react-query";
import { Link, useMatchRoute } from "@tanstack/react-router";
import { Eraser, XIcon, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { render } from "react-dom";
import { useDefinedUser } from "../camps-state";
import { Input } from "@/components/ui/input";
import { run } from "@fireside/utils";

const pencilImage = new Image(15, 15);
pencilImage.src = "/pencil-mouse.png";

const subscribeFn = client.api.protected.whiteboard.ws({
  whiteBoardId: "who cares",
}).subscribe;

type Point = {
  x: number;
  y: number;
  pointId: string;
  color: string;
};

type Options = Partial<{
  slot: React.ReactNode;
  readOnly: boolean;
  scale: number;
  canPan: boolean;
}>;
const cameraPOV = ({
  x,
  y,
  camera,
}: {
  x: number;
  y: number;
  camera: { x: number; y: number };
}) => ({ x: x - camera.x, y: y - camera.y });

const getWhiteBoardQueryOptions = ({
  whiteBoardId,
}: {
  whiteBoardId: string;
}) =>
  queryOptions({
    queryKey: ["white-board", whiteBoardId],
    queryFn: () =>
      promiseDataOrThrow(
        client.api.protected.whiteboard.retrieve({ whiteBoardId }).get()
      ),
  });

const getWhiteBoardMousePointsOptions = ({
  whiteBoardId,
}: {
  whiteBoardId: string;
}) =>
  queryOptions({
    queryKey: ["white-board-mouse-points", whiteBoardId],
    queryFn: () =>
      promiseDataOrThrow(
        client.api.protected.whiteboard.mouse.retrieve({ whiteBoardId }).get()
      ),
  });

const getWhiteBoardMouseEraserOptions = ({
  whiteBoardId,
}: {
  whiteBoardId: string;
}) =>
  queryOptions({
    queryKey: ["white-board-eraser-points", whiteBoardId],
    queryFn: () =>
      promiseDataOrThrow(
        client.api.protected.whiteboard.eraser.retrieve({ whiteBoardId }).get()
      ),
  });

const getWhiteBoardImagesOptions = ({
  whiteBoardId,
}: {
  whiteBoardId: string;
}) =>
  queryOptions({
    queryKey: ["white-board-images", whiteBoardId],
    queryFn: () =>
      promiseDataOrThrow(
        client.api.protected.whiteboard["whiteboard-image"]
          .retrieve({ whiteBoardId })
          .get()
      ),
    select: (data) =>
      data.map((data) => ({
        ...data,
        image: run(() => {
          const image = new Image(200, 200);
          image.src = data.imgUrl;
          return image;
        }),
      })),
  });
export const WhiteBoardLoader = ({
  whiteBoardId,
  options,
}: {
  whiteBoardId: string;
  options?: Options;
}) => {
  const whiteBoardQuery = useQuery(getWhiteBoardQueryOptions({ whiteBoardId }));

  const whiteBoardMousePointsQuery = useQuery(
    getWhiteBoardMousePointsOptions({ whiteBoardId })
  );

  const whiteBoardImagesQuery = useQuery(
    getWhiteBoardImagesOptions({ whiteBoardId })
  );

  const whiteBoardEraserQuery = useQuery(
    getWhiteBoardMouseEraserOptions({ whiteBoardId })
  );

  if (
    whiteBoardMousePointsQuery.isLoading ||
    whiteBoardImagesQuery.isLoading ||
    whiteBoardEraserQuery.isLoading
  ) {
    return <LoadingSection />;
  }

  if (
    whiteBoardMousePointsQuery.isError ||
    whiteBoardImagesQuery.isError ||
    whiteBoardEraserQuery.isError
  ) {
    return <div> something went wrong</div>;
  }

  switch (whiteBoardQuery.status) {
    case "error": {
      return <div>something went wrong</div>;
    }
    case "pending": {
      return <LoadingSection />;
    }
    case "success": {
      return (
        <WhiteBoard
          whiteBoardEraserPoints={whiteBoardEraserQuery.data ?? []}
          whiteBoardImages={whiteBoardImagesQuery.data ?? []}
          whiteBoardMousePoints={whiteBoardMousePointsQuery.data ?? []}
          whiteBoardId={whiteBoardId}
          whiteBoard={whiteBoardQuery.data}
          options={options}
        />
      );
    }
  }
};

const onlyForTheType = client.api.protected.whiteboard.retrieve({
  whiteBoardId: "whatever",
}).get;
const onlyForTheTypeAgain = client.api.protected.whiteboard.mouse.retrieve({
  whiteBoardId: "whatever",
}).get;
const onlyForTheTypeAgainAgain =
  client.api.protected.whiteboard.eraser.retrieve({
    whiteBoardId: "whatever",
  }).get;

const WhiteBoard = ({
  whiteBoard,
  whiteBoardId,
  whiteBoardMousePoints,
  options,
  whiteBoardImages,
  whiteBoardEraserPoints,
}: {
  whiteBoard: (ReturnType<typeof onlyForTheType> extends Promise<infer R>
    ? R
    : never)["data"];

  whiteBoardMousePoints: (ReturnType<
    typeof onlyForTheTypeAgain
  > extends Promise<infer R>
    ? R
    : never)["data"];

  whiteBoardEraserPoints: {} & (ReturnType<
    typeof onlyForTheTypeAgainAgain
  > extends Promise<infer R>
    ? R
    : never)["data"];
  whiteBoardId: string;
  options?: Options;
  whiteBoardImages: Array<WhiteBoardImgSelect & { image: HTMLImageElement }>;
}) => {
  const whiteBoardImagesOptions = getWhiteBoardImagesOptions({ whiteBoardId });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isMouseDown, setIsMouseDown] = useState(false);
  // const currentMousePositionRef = useRef<{ x: number; y: number } | null>(null);
  const [currentMousePosition, setCurrentMousePosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [drawingPoints, setDrawingPoints] = useState<
    Array<TransformedWhiteBoardPointGroup>
  >([]);
  const user = useDefinedUser();
  const newGroupIdRef = useRef<string | null>(null);
  const whiteBoardQueryKey = getWhiteBoardQueryOptions({
    whiteBoardId,
  }).queryKey;

  const whiteBoardPointsQueryKey = getWhiteBoardMousePointsOptions({
    whiteBoardId,
  }).queryKey;

  const whiteBoardEraserQueryKey = getWhiteBoardMouseEraserOptions({
    whiteBoardId,
  }).queryKey;

  const drawnPoints = whiteBoard ?? [];

  // console.log({ drawnPoints });
  // const [erased, setErased] = useState<Array<{ x: number; y: number }>>([]); // todo

  // const mouseCords = currentMousePositionRef.current;

  const uploadImgMutation = useMutation({
    mutationFn: async ({
      file,
      x,
      y,
    }: {
      file: FileList;
      x: number;
      y: number;
    }) => {
      const formData = new FormData();

      formData.append("whiteBoardImg", file[0]);
      formData.append("x", x.toString());
      formData.append("y", y.toString());
      const res = await fetch(
        import.meta.env.VITE_API_URL +
          `/api/protected/whiteboard/whiteboard-image/upload/${whiteBoardId}`,
        {
          method: "POST",
          body: formData,
          credentials: "include",
        }
      );

      return res.json() as Promise<WhiteBoardImgSelect>;
    },

    onSuccess: (data) => {
      queryClient.setQueryData(whiteBoardImagesOptions.queryKey, (prev) => [
        ...(prev ?? []),
        data,
      ]);
    },
  });

  const parentCanvasRef = useRef<HTMLDivElement | null>(null);
  const [camera, setCamera] = useState({ x: 0, y: 0 });
  const [selectedTool, setSelectedTool] = useState<
    | { kind: "marker"; color: (typeof whiteBoardColors)[number] }
    | { kind: "eraser" }
  >({ kind: "marker", color: "blue" });

  const subscriptionRef = useRef<null | ReturnType<typeof subscribeFn>>(null);

  useEffect(() => {
    const newSubscription = client.api.protected.whiteboard
      .ws({ whiteBoardId })
      .subscribe();

    subscriptionRef.current = newSubscription;
    return () => {
      newSubscription.close();
      subscriptionRef.current = null;
    };
  }, []);

  useEffect(() => {
    const handleMessage = (e: { data: unknown }) => {
      const publishedData = e.data as WhiteBoardPublish;

      switch (publishedData.kind) {
        case "point": {
          queryClient.setQueryData(whiteBoardQueryKey, (prev) => {
            const someGroupExists = prev?.some(
              (points) =>
                points.at(0)?.whiteBoardPointGroupId ===
                publishedData.whiteBoardPointGroupId
            );

            if (someGroupExists) {
              return prev?.map((points) =>
                points.at(0)?.whiteBoardPointGroupId ===
                publishedData.whiteBoardPointGroupId
                  ? [...points, publishedData]
                  : points
              );
            }

            return [...(prev ?? []), [publishedData]];
          });
          return;
        }

        case "mouse": {
          queryClient.setQueryData(whiteBoardPointsQueryKey, (prev) => {
            const withoutCurrentMousePosition =
              prev?.filter(({ userId }) => {
                return userId !== publishedData.userId;
              }) ?? [];

            return [...withoutCurrentMousePosition, publishedData];
          });

          return;
        }

        case "eraser": {
          queryClient.setQueryData(whiteBoardEraserQueryKey, (prev) => {
            return [...(prev ?? []), publishedData];
          });

          return;
        }
      }
    };

    subscriptionRef.current?.on("message", handleMessage);
    return () => {};
  }, []);

  const render = (recursive = false) => {
    const canvasEl = canvasRef.current;
    const parentEl = parentCanvasRef.current;

    if (!canvasEl) {
      return;
    }
    if (!parentEl) {
      return;
    }

    const ctx = canvasEl.getContext("2d");
    if (!ctx) {
      return;
    }

    const dpr = window.devicePixelRatio;
    const rect = parentEl.getBoundingClientRect();

    canvasEl.width = rect.width * dpr;
    canvasEl.height = rect.height * dpr;

    canvasEl.style.width = `${rect.width}px`;
    canvasEl.style.height = `${rect.height}px`;

    ctx.scale(dpr, dpr);

    if (options?.scale) {
      ctx.scale(options.scale, options.scale);
    }

    ctx.save();

    ctx.translate(camera.x, camera.y);

    const drawLine = ({
      points,
      initialPoint,
    }: {
      points: Array<TransformedWhiteBoardPointGroup>;
      initialPoint: TransformedWhiteBoardPointGroup;
    }) => {
      ctx.moveTo(initialPoint.x, initialPoint.y);
      ctx.strokeStyle = initialPoint.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      points.forEach((point) => {
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
      });
    };

    const erasePoints = ({
      erasedPoints,
      color,
    }: {
      erasedPoints: typeof whiteBoardEraserPoints;
      color?: string;
    }) => {
      ctx.beginPath();
      ctx.strokeStyle = color ?? "white";
      ctx.fillStyle = color ?? "white";
      ctx.lineWidth = 53.5;

      erasedPoints.forEach((erasedPoint) => {
        ctx.beginPath();
        ctx.arc(erasedPoint.x, erasedPoint.y, 0.0001, 0, 2 * Math.PI);
        ctx.fillStyle = "white";
        ctx.stroke();
      });
    };

    const pointsArr = [...drawnPoints, drawingPoints];
    const distributedErasedPoints = { current: whiteBoardEraserPoints };
    const initialCreatedAt = pointsArr.flat().reduce((prev, curr) => {
      if (!prev) {
        return curr;
      }
      if (
        new Date(curr.createdAt!).getTime() <
        new Date(prev.createdAt!).getTime()
      ) {
        return curr;
      }
      return prev;
    }, pointsArr.flat().at(0));

    if (initialCreatedAt) {
      const claimedErasedPoints: (typeof distributedErasedPoints)["current"] =
        [];
      distributedErasedPoints.current.forEach((erasedPoint) => {
        if (!erasedPoint.createdAt) {
          console.log("bitch");
          return;
        }

        if (
          new Date(erasedPoint.createdAt).getTime() <
          new Date(initialCreatedAt.createdAt!).getTime()
        ) {
          claimedErasedPoints.push(erasedPoint);
          distributedErasedPoints.current =
            distributedErasedPoints.current.filter(
              (toRemoveErasedPoint) => toRemoveErasedPoint.id !== erasedPoint.id
            );
        }
      });

      erasePoints({ color: "white", erasedPoints: claimedErasedPoints });
    }

    pointsArr
      .toSorted((a, b) => {
        const aGroupCreatedAt = a.at(0)?.createdAt;
        const bGroupCreatedAt = b.at(0)?.createdAt;

        if (!aGroupCreatedAt || !bGroupCreatedAt) {
          return -1;
        }

        return (
          new Date(aGroupCreatedAt).getTime() -
          new Date(bGroupCreatedAt).getTime()
        );
      })
      .forEach((points) => {
        const initialPoint = points.at(0);

        if (!initialPoint) {
          return;
        }

        const claimedErasedPoints: (typeof distributedErasedPoints)["current"] =
          [];

        distributedErasedPoints.current.forEach((erasedPoint) => {
          if (!erasedPoint.createdAt || !initialPoint.createdAt) {
            return;
          }

          if (
            new Date(erasedPoint.createdAt).getTime() <
            new Date(initialPoint.createdAt).getTime()
          ) {
            claimedErasedPoints.push(erasedPoint);
            distributedErasedPoints.current =
              distributedErasedPoints.current.filter(
                (toRemoveErasedPoint) =>
                  toRemoveErasedPoint.id !== erasedPoint.id
              );
          }
        });

        erasePoints({ color: "white", erasedPoints: claimedErasedPoints });
        ctx.stroke();

        drawLine({ points, initialPoint });
      });

    erasePoints({
      color: "white",
      erasedPoints: distributedErasedPoints.current,
    });

    if (selectedTool.kind === "eraser" && currentMousePosition) {
      ctx.fillStyle = "black";
      const radius = 25;
      const borderWidth = 1;

      ctx.beginPath();
      ctx.arc(
        currentMousePosition?.x,
        currentMousePosition.y,
        radius,
        0,
        2 * Math.PI
      );
      ctx.fillStyle = "white";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(
        currentMousePosition.x,
        currentMousePosition?.y,
        radius + borderWidth,
        0,
        2 * Math.PI
      );
      ctx.strokeStyle = "black";
      ctx.lineWidth = borderWidth;
      ctx.stroke();
    }

    whiteBoardImages.forEach((whiteBoardImg) => {
      if (whiteBoardImg.image.complete) {
        ctx.drawImage(
          whiteBoardImg.image,
          whiteBoardImg.x,
          whiteBoardImg.y,
          200,
          200
        );
      }
    });
    whiteBoardMousePoints?.forEach((mousePoint) => {
      if (pencilImage.complete) {
        ctx.drawImage(pencilImage, mousePoint.x, mousePoint.y, 20, 20);
      }

      ctx.font = "10px";
      ctx.fillText(
        mousePoint.user.username,
        mousePoint.x - 15,
        mousePoint.y - 5
      );
    });
    // }

    ctx.stroke();

    ctx.restore();

    if (recursive) {
      requestAnimationFrame(() => render());
    }
  };

  const [_, setUpdate] = useState(false);

  useEffect(() => {
    const parentCanvasEl = parentCanvasRef.current!;

    const observer = new ResizeObserver(() => {
      setUpdate((prev) => !prev);
    });

    observer.observe(parentCanvasEl);

    return () => observer.unobserve(parentCanvasEl);
  }, []);

  useEffect(() => {
    render(true);

    const intervalId = setInterval(() => {
      render(false);
    }, 500); // run every 500ms to catch any stale changes not being reacted to

    return () => {
      clearInterval(intervalId);
    };
  }, [render]);

  useEffect(() => {
    if (options?.canPan === false) {
      return;
    }
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      setCamera((prev) => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
      if (currentMousePosition) {
        // currentMousePosition = {
        //   x: currentMousePosition.x + e.deltaX,
        //   y: currentMousePosition.y + e.deltaY,
        // };

        // const newMouse = {
        //   x: currentMousePosition.x + e.deltaX,
        //   y: currentMousePosition.y + e.deltaY,
        // };

        setCurrentMousePosition((prev) => {
          if (!prev) {
            return prev;
          }
          const newMouse = {
            x: prev.x + e.deltaX,
            y: prev.y + e.deltaY,
          };
          subscriptionRef.current?.send({
            ...newMouse,
            id: crypto.randomUUID(),
            kind: "mouse",
            whiteBoardId,
            userId: user.id,
            user,
            createdAt: new Date().toISOString(),
          });
          return newMouse;
        });
      }
    };
    canvasRef.current?.addEventListener("wheel", handleWheel);

    return () => canvasRef.current?.removeEventListener("wheel", handleWheel);
  }, [options?.canPan, currentMousePosition !== null]);

  const handleMouseInteraction = (
    e: React.MouseEvent<HTMLCanvasElement, MouseEvent>,
    isMouseDownOverride?: boolean
  ) => {
    const newMouse = cameraPOV({
      camera,
      x: e.nativeEvent.offsetX,
      y: e.nativeEvent.offsetY,
    });

    setCurrentMousePosition(newMouse);

    subscriptionRef.current?.send({
      ...newMouse,
      id: crypto.randomUUID(),
      kind: "mouse",
      whiteBoardId,
      userId: user.id,
      user,
      createdAt: new Date().toISOString(),
    });
    // if (!mouseCords) {
    //   return;
    // }

    if (!isMouseDown && !isMouseDownOverride) {
      if (selectedTool.kind === "eraser") {
        console.log("kill");
      }

      return;
    }

    if (!newGroupIdRef.current) {
      if (selectedTool.kind === "eraser") {
        console.log("kill2");
      }
      return;
    }
    switch (selectedTool.kind) {
      case "marker": {
        if (options?.readOnly) {
          return;
        }
        const newPoint = {
          ...newMouse,
          color: selectedTool.color,
          whiteBoardId,
          id: genWhiteBoardPointId(),
          whiteBoardPointGroupId: newGroupIdRef.current,
          kind: "point" as const,
          createdAt: new Date().getTime(),
        };
        setDrawingPoints((prev) => [...prev, newPoint]);

        subscriptionRef.current?.send({ ...newPoint, kind: "point" });

        return;
      }
      // disable till we think of a good way to erase
      case "eraser": {
        const newEraserPoint = {
          ...newMouse,
          id: crypto.randomUUID(),
          kind: "eraser" as const,
          userId: user.id,
          whiteBoardId,
          createdAt: new Date().toISOString(),
        };

        // setErased((prev) => [...prev, newMouse]);
        queryClient.setQueryData(whiteBoardEraserQueryKey, (prev) => [
          ...(prev ?? []),
          {
            ...newMouse,
            id: crypto.randomUUID(),
            kind: "eraser" as const,
            userId: user.id,
            whiteBoardId,
            createdAt: new Date().toISOString(),
          },
        ]);

        subscriptionRef.current?.send(newEraserPoint);
        // setDrawnPoints((drawnPoints) =>
        //   drawnPoints.map((points) =>
        //     points.filter(
        //       (point) =>
        //         point.x !== e.nativeEvent.offsetX &&
        //         point.y !== e.nativeEvent.offsetY
        //     )
        //   )
        // );
      }
    }
  };

  return (
    <div ref={parentCanvasRef} className="w-full h-full relative">
      {options?.slot}
      {!options?.readOnly && (
        <Input
          id="img-upload"
          onChange={() => {
            const files = (
              document.getElementById("img-upload") as HTMLInputElement
            ).files!;
            uploadImgMutation.mutate({
              file: files,
              x: -camera.x + parentCanvasRef.current!.clientWidth / 2,
              y: -camera.y + parentCanvasRef.current!.clientHeight / 2,
            });
          }}
          className="absolute top-3 left-3 bg-white border-muted w-[100px] p-1 h-fit text-xs transition hover:bg-gray-100  hover:text-white"
          type="file"
        />
      )}
      {uploadImgMutation.isPending && (
        <span className="absolute top-3 left-28 text-black">
          <LoadingSpinner />
        </span>
      )}

      {!options?.readOnly && (
        <div className="absolute bottom-2 border border-gray-200 bg-opacity-50 backdrop-blur-md right-[7px] rounded-lg p-3  flex justify-evenly items-center w-[95%]">
          {whiteBoardColors.map((color) => (
            <Button
              key={color}
              onClick={() => setSelectedTool({ kind: "marker", color: color })}
              style={{
                backgroundColor: color,
                // borderColor:
              }}
              className={cn([
                "rounded-full w-10 h-10 hover:bg-inherit transition",
                color === "white" && "border",
                selectedTool.kind === "marker" &&
                  color === selectedTool.color &&
                  "border-2 border-inherit/50  scale-110",
              ])}
            />
          ))}
          <Button
            onClick={() => setSelectedTool({ kind: "eraser" })}
            variant={"ghost"}
            className={cn([
              "rounded-full w-10 h-10 p-0 bg-white hover:bg-inherit transition",
              selectedTool.kind === "eraser" && "scale-110 border-2 ",
            ])}
          >
            <Eraser className="text-black" />
          </Button>
          <div className="text-black w-[50px]">
            ({camera.x.toFixed(1)},{camera.y.toFixed(1)})
          </div>
        </div>
      )}

      <canvas
        onMouseLeave={() => {
          setIsMouseDown(false);
          // currentMousePositionRef.current = null;
          setCurrentMousePosition(null);

          if (drawingPoints.length === 0) {
            return;
          }

          queryClient.setQueryData(whiteBoardQueryKey, (prev) => [
            ...(prev ?? []),
            drawingPoints,
          ]);
          setDrawingPoints([]);
        }}
        onMouseUp={() => {
          setIsMouseDown(false);

          queryClient.setQueryData(whiteBoardQueryKey, (prev) => [
            ...(prev ?? []),
            drawingPoints,
          ]);
          setDrawingPoints([]);
        }}
        onMouseMove={handleMouseInteraction}
        onMouseDown={(e) => {
          newGroupIdRef.current = crypto.randomUUID();
          setIsMouseDown(true);

          handleMouseInteraction(e, true);
        }}
        className="bg-white w-full h-full overflow-hidden touch-none"
        ref={canvasRef}
      />
    </div>
  );
};
