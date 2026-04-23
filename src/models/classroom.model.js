import { defineSqlModel, withBaseRow } from "./base.model.js";

export const classroomModel = defineSqlModel({
  name: "Classroom",
  table: "classrooms",
  columns: {
    name: { type: "varchar(120)", nullable: false, unique: true },
    code: { type: "varchar(50)", nullable: true, unique: true },
    building: { type: "varchar(120)", nullable: true },
    floor: { type: "varchar(30)", nullable: true },
    capacity: { type: "integer", nullable: true },
    camera_url: { type: "text", nullable: true },
    device_status: { type: "varchar(20)", nullable: false, default: "'active'" }
  },
  checks: [
    { name: "chk_classrooms_capacity", expression: "capacity IS NULL OR capacity > 0" },
    {
      name: "chk_classrooms_device_status",
      expression: "device_status IN ('active', 'inactive', 'maintenance')"
    }
  ]
});

export const createClassroom = ({
  name,
  code = null,
  building = null,
  floor = null,
  capacity = null,
  cameraUrl = null,
  camera_url = null,
  deviceStatus = "active"
}) =>
  withBaseRow({
    name: String(name).trim(),
    code,
    building,
    floor,
    capacity,
    camera_url: cameraUrl ?? camera_url,
    device_status: deviceStatus
  });

export default classroomModel;
