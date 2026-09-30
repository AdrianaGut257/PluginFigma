if (figma.editorType === "figma") {
  figma.showUI(__html__);
  figma.ui.onmessage = (msg: { type: string; count: number }) => {
    if (msg.type === "create-shapes") {
      const numberOfRectangles = msg.count;

      const nodes: SceneNode[] = [];
      for (let i = 0; i < numberOfRectangles; i++) {
        const rect = figma.createRectangle();
        rect.x = i * 150;
        rect.fills = [{ type: "SOLID", color: { r: 1, g: 0.5, b: 0 } }];
        figma.currentPage.appendChild(rect);
        nodes.push(rect);
      }
      figma.currentPage.selection = nodes;
      figma.viewport.scrollAndZoomIntoView(nodes);
    }
    figma.closePlugin();
  };
}

if (figma.editorType === "figjam") {
  figma.showUI(__html__);

  figma.ui.onmessage = (msg: { type: string; count: number }) => {
    if (msg.type === "create-shapes") {
      const numberOfShapes = msg.count;

      const nodes: SceneNode[] = [];
      for (let i = 0; i < numberOfShapes; i++) {
        const shape = figma.createShapeWithText();
        shape.shapeType = "ROUNDED_RECTANGLE";
        shape.x = i * (shape.width + 200);
        shape.fills = [{ type: "SOLID", color: { r: 1, g: 0.5, b: 0 } }];
        figma.currentPage.appendChild(shape);
        nodes.push(shape);
      }

      for (let i = 0; i < numberOfShapes - 1; i++) {
        const connector = figma.createConnector();
        connector.strokeWeight = 8;

        connector.connectorStart = {
          endpointNodeId: nodes[i].id,
          magnet: "AUTO",
        };

        connector.connectorEnd = {
          endpointNodeId: nodes[i + 1].id,
          magnet: "AUTO",
        };
      }

      figma.currentPage.selection = nodes;
      figma.viewport.scrollAndZoomIntoView(nodes);
    }

    figma.closePlugin();
  };
}
