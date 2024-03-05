CREATE TABLE IF NOT EXISTS territories (
	type varchar NOT NULL,
	code integer NOT NULL,
	name varchar,
	uf varchar,
	geometry geometry,
	PRIMARY KEY(type, code)
);

CREATE INDEX territories_geom_idx ON territories USING GIST (geometry);

CREATE TABLE IF NOT EXISTS territories_grids (
	territory_type varchar NOT NULL,
	territory_code integer NOT NULL,
	grid_id integer NOT NULL,
	PRIMARY KEY (territory_type, territory_code, grid_id),
	CONSTRAINT FK_territories_grids_territory FOREIGN KEY(territory_type, territory_code) REFERENCES territories(type, code),
	CONSTRAINT FK_territories_grids_grid FOREIGN KEY(grid_id) REFERENCES grids(id)
);

INSERT INTO territories(type, code, name, uf, geometry)
	SELECT
		'estado' as type,
		cd_uf::int as code,
		nm_uf as name,
		sigla_uf as uf,
		geometry
	FROM
		states;
		
INSERT INTO territories(type, code, name, uf, geometry)
	SELECT
		'municipio' as type,
		code::int as code,
		name as name,
		acronym_uf as uf,
		geometry
	FROM
		cities;

INSERT INTO territories(type, code, name, geometry)
	SELECT
		'bioma' as type,
		cd_bioma::int as code,
		bioma as name,
		geometry
	FROM
		biomes;

INSERT INTO territories_grids (territory_type, territory_code, grid_id)
	SELECT
		t.type as territory_type,
		t.code as territory_code,
		g.id as grid_id
	FROM
		territories as t
		INNER JOIN grids as g
		ON ST_Intersects(t.geometry, g.geometry);

